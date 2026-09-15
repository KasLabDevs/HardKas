/**
 * TQ-1 `REMOTE_TESTNET_NODE` authority + probe.
 *
 * Probe sequence (agreed 2026-09-15):
 *   connect → getServerInfo → assert networkId → assert isSynced
 *          → record serverVersion/rpcApiVersion/hasUtxoIndex/virtualDaaScore
 *          → getBlockDagInfo (secondary, correlation)
 *          → capability probes (getNetworkParams, getFeeEstimate)
 *
 * Rules:
 * - `getServerInfo.networkId` is the primary authority for network identity.
 *   Never inferred from hostname/URL. Caller MUST pass `expectedNetworkId`.
 * - Any assertion miss → FAIL CLOSED, no further probe runs.
 * - `hasUtxoIndex` is scenario-scoped: recorded here, required only when a
 *   scenario declares it in `requiredCapabilities`. This module does NOT
 *   enforce it globally.
 * - Sensitive fields are NOT redacted here. The raw authority carries the
 *   caller-supplied endpoint address as-is; a downstream `--for-sharing`
 *   redactor (Block 3) produces a derived artifact.
 */

import { createHash } from "node:crypto";
import { RemoteTestnetProbeFailedErrorMarker } from "./retry.js";

export type EndpointClass = "wrpc" | "grpc" | "http" | "unknown";

export interface EndpointDescriptor {
  readonly class: EndpointClass;
  readonly address: string;
}

export interface GetServerInfoResponse {
  readonly networkId: string;
  readonly serverVersion: string;
  readonly rpcApiVersion?: string | number;
  readonly hasUtxoIndex: boolean;
  readonly isSynced: boolean;
  readonly virtualDaaScore: bigint | string | number;
}

export interface GetBlockDagInfoResponse {
  readonly networkName?: string;
  readonly blockCount?: bigint | string | number;
  readonly virtualDaaScore: bigint | string | number;
  readonly tipHashes?: readonly string[];
}

export interface RemoteNodeRpc {
  getServerInfo(): Promise<GetServerInfoResponse>;
  getBlockDagInfo(): Promise<GetBlockDagInfoResponse>;
  /** Optional capability. Presence detected by attempting the call. */
  getNetworkParams?(networkId: string): Promise<unknown>;
  /** Optional capability. Presence detected by attempting the call. */
  getFeeEstimate?(input?: unknown): Promise<unknown>;
}

export type CapabilityName = "getNetworkParams" | "getFeeEstimate" | "hasUtxoIndex";

export interface RemoteTestnetAuthority {
  readonly authorityKind: "REMOTE_TESTNET_NODE";
  readonly endpoint: EndpointDescriptor;
  readonly observedAt: string;
  readonly network: { readonly expected: string; readonly observed: string };
  readonly serverVersion: string;
  readonly rpcApiVersion?: string | number;
  readonly isSynced: boolean;
  readonly hasUtxoIndex: boolean;
  readonly virtualDaaScore: bigint;
  readonly capabilities: {
    readonly getNetworkParams: boolean;
    readonly getFeeEstimate: boolean;
    readonly hasUtxoIndex: boolean;
  };
  readonly probeHashes: {
    readonly getServerInfo: string;
    readonly getBlockDagInfo: string;
    readonly getNetworkParams?: string;
    readonly getFeeEstimate?: string;
  };
}

export type ProbeFailureReason =
  | "NETWORK_MISMATCH"
  | "UNSYNCED"
  | "MISSING_CAPABILITY"
  | "RPC_ERROR";

export class RemoteTestnetProbeFailedError extends RemoteTestnetProbeFailedErrorMarker {
  readonly reason: ProbeFailureReason;
  readonly detail: Record<string, unknown> | undefined;
  constructor(reason: ProbeFailureReason, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "RemoteTestnetProbeFailedError";
    this.reason = reason;
    this.detail = detail;
  }
}

export interface ProbeRemoteTestnetInput {
  readonly endpoint: EndpointDescriptor;
  readonly rpc: RemoteNodeRpc;
  readonly expectedNetworkId: string;
  /** Capabilities that MUST be present. Missing ones → FAIL CLOSED. */
  readonly requiredCapabilities?: readonly CapabilityName[];
  /** Injectable clock for tests. Defaults to `Date.now`. */
  readonly now?: () => Date;
}

function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return value.toString() + "n";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}

function hashResponse(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function coerceBigint(v: bigint | string | number): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      throw new Error(`Expected integer for DAA score, got ${v}`);
    }
    return BigInt(v);
  }
  if (typeof v === "string") return BigInt(v);
  throw new Error(`Unsupported DAA score type: ${typeof v}`);
}

/**
 * Probe a remote testnet node. Fails closed on any assertion miss.
 *
 * The caller supplies:
 * - `endpoint`: descriptor for provenance only; this function does NOT open
 *   the connection. The `rpc` instance is expected to be already connected.
 * - `expectedNetworkId`: authoritative caller declaration. If the server
 *   reports a different `networkId`, probe throws NETWORK_MISMATCH.
 * - `requiredCapabilities`: scenario-scoped list of capabilities that MUST
 *   be present. Non-required capabilities are still probed and recorded, but
 *   their absence does not fail the probe.
 */
export async function probeRemoteTestnet(input: ProbeRemoteTestnetInput): Promise<RemoteTestnetAuthority> {
  const now = input.now ?? (() => new Date());

  // 1. getServerInfo — required.
  let serverInfo: GetServerInfoResponse;
  try {
    serverInfo = await input.rpc.getServerInfo();
  } catch (err) {
    throw new RemoteTestnetProbeFailedError(
      "RPC_ERROR",
      `getServerInfo failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err instanceof Error ? err.message : String(err) }
    );
  }

  // 2. assert networkId matches expected — FAIL CLOSED on mismatch.
  if (serverInfo.networkId !== input.expectedNetworkId) {
    throw new RemoteTestnetProbeFailedError(
      "NETWORK_MISMATCH",
      `Network mismatch: expected '${input.expectedNetworkId}' but node reports '${serverInfo.networkId}'`,
      { expected: input.expectedNetworkId, observed: serverInfo.networkId }
    );
  }

  // 3. assert isSynced — FAIL CLOSED on unsynced.
  if (!serverInfo.isSynced) {
    throw new RemoteTestnetProbeFailedError(
      "UNSYNCED",
      `Remote node reports not synced (networkId='${serverInfo.networkId}', serverVersion='${serverInfo.serverVersion}')`,
      { networkId: serverInfo.networkId, serverVersion: serverInfo.serverVersion }
    );
  }

  // 4. getBlockDagInfo — secondary correlation.
  let dagInfo: GetBlockDagInfoResponse;
  try {
    dagInfo = await input.rpc.getBlockDagInfo();
  } catch (err) {
    throw new RemoteTestnetProbeFailedError(
      "RPC_ERROR",
      `getBlockDagInfo failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err instanceof Error ? err.message : String(err) }
    );
  }

  // 5. capability probes — always run, never fatal unless required.
  const capabilities = {
    getNetworkParams: false,
    getFeeEstimate: false,
    hasUtxoIndex: serverInfo.hasUtxoIndex === true
  };
  const probeHashes: {
    getServerInfo: string;
    getBlockDagInfo: string;
    getNetworkParams?: string;
    getFeeEstimate?: string;
  } = {
    getServerInfo: hashResponse(serverInfo),
    getBlockDagInfo: hashResponse(dagInfo)
  };

  if (typeof input.rpc.getNetworkParams === "function") {
    try {
      const npResponse = await input.rpc.getNetworkParams(serverInfo.networkId);
      capabilities.getNetworkParams = true;
      probeHashes.getNetworkParams = hashResponse(npResponse);
    } catch {
      capabilities.getNetworkParams = false;
    }
  }

  if (typeof input.rpc.getFeeEstimate === "function") {
    try {
      const feeResponse = await input.rpc.getFeeEstimate({});
      capabilities.getFeeEstimate = true;
      probeHashes.getFeeEstimate = hashResponse(feeResponse);
    } catch {
      capabilities.getFeeEstimate = false;
    }
  }

  // 6. enforce scenario-declared required capabilities.
  if (input.requiredCapabilities && input.requiredCapabilities.length > 0) {
    const missing = input.requiredCapabilities.filter((c) => !capabilities[c]);
    if (missing.length > 0) {
      throw new RemoteTestnetProbeFailedError(
        "MISSING_CAPABILITY",
        `Missing required capability: ${missing.join(", ")}`,
        { missing, availableCapabilities: capabilities }
      );
    }
  }

  const authority: RemoteTestnetAuthority = {
    authorityKind: "REMOTE_TESTNET_NODE",
    endpoint: input.endpoint,
    observedAt: now().toISOString(),
    network: { expected: input.expectedNetworkId, observed: serverInfo.networkId },
    serverVersion: serverInfo.serverVersion,
    ...(serverInfo.rpcApiVersion !== undefined ? { rpcApiVersion: serverInfo.rpcApiVersion } : {}),
    isSynced: true,
    hasUtxoIndex: capabilities.hasUtxoIndex,
    virtualDaaScore: coerceBigint(serverInfo.virtualDaaScore),
    capabilities,
    probeHashes
  };

  return authority;
}

/**
 * Post-hoc assertion for a `RemoteTestnetAuthority` cached earlier. Useful
 * when a scenario runner receives an authority produced by an orchestrator
 * and wants to re-check invariants before consuming it.
 */
export function assertRemoteTestnetOrFailClosed(
  authority: RemoteTestnetAuthority,
  expectedNetworkId: string
): void {
  if (authority.network.observed !== expectedNetworkId) {
    throw new RemoteTestnetProbeFailedError(
      "NETWORK_MISMATCH",
      `Network mismatch on cached authority: expected '${expectedNetworkId}' but authority observed '${authority.network.observed}'`,
      { expected: expectedNetworkId, observed: authority.network.observed }
    );
  }
  if (!authority.isSynced) {
    throw new RemoteTestnetProbeFailedError(
      "UNSYNCED",
      `Cached authority marks isSynced=false; refresh probe before use`,
      { networkId: authority.network.observed }
    );
  }
}
