// INT9-A (I-1) · the network and consensus levels of `artifact verify` (the CLI side; the levels are the SDK's).
//
// What it contacts, and when: nothing unless the caller asks for a network check (`--network`, `--url`, `--since` or
// `--require network|consensus`); never for an artifact that failed integrity, a simulated artifact, an artifact that
// names no transaction, or anything of mainnet (requested or recorded) — those are NOT_CHECKED with their reason, before
// any connection. Otherwise: the endpoint by the shared endpoint authority (`--url`, else the workspace's declared one,
// else a local network's default; a public network with none is NOT_CHECKED, nothing contacted), the node's identity
// (container + digest for the managed localnet, its own report otherwise) and its sync state, then ONE read-only look.
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

export type ArtifactVerifyRequirement = "integrity" | "network" | "consensus";

export interface ArtifactNetworkCheckOptions {
  readonly network?: string | undefined;
  readonly url?: string | undefined;
  readonly since?: string | undefined;
  readonly minConfirmations?: string | undefined;
  readonly workspaceRoot: string;
}

const norm = (u: string) => u.trim().replace(/\/+$/, "").replace("://localhost:", "://127.0.0.1:");

export function networkCheckRequested(opts: { network?: unknown; url?: unknown; since?: unknown; require?: unknown }): boolean {
  return opts.network !== undefined || opts.url !== undefined || opts.since !== undefined || opts.require === "network" || opts.require === "consensus";
}

export function parseRequirement(value: unknown): ArtifactVerifyRequirement {
  if (value === undefined) return "integrity";
  if (value === "integrity" || value === "network" || value === "consensus") return value;
  throw new HardkasCliError("ARTIFACT_VERIFY_REQUIREMENT_INVALID", `--require '${String(value)}' is not one of integrity, network, consensus`, {
    exitCode: HardkasExitCode.USAGE_ERROR
  });
}

async function policyOf(minConfirmations: string | undefined) {
  const { TX_STATUS_POLICY_HARDKAS_DEFAULT_V1 } = await import("@hardkas/artifacts");
  if (minConfirmations === undefined) return TX_STATUS_POLICY_HARDKAS_DEFAULT_V1;
  if (!/^\d{1,9}$/.test(minConfirmations)) {
    throw new HardkasCliError("ARTIFACT_VERIFY_POLICY_INVALID", `--min-confirmations '${minConfirmations}' is not a non-negative integer`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  return { ...TX_STATUS_POLICY_HARDKAS_DEFAULT_V1, origin: "user" as const, minConfirmations: Number(minConfirmations) };
}

/** The network and consensus levels for one parsed artifact whose integrity already passed. */
export async function checkArtifactOnNetwork(artifact: unknown, opts: ArtifactNetworkCheckOptions) {
  const { artifactNetworkSubject, verifyArtifactOnNetwork, notCheckedNetworkVerification } = await import("@hardkas/sdk");
  const core = await import("@hardkas/core");
  const policy = await policyOf(opts.minConfirmations);
  if (opts.since !== undefined && !/^[0-9a-f]{64}$/i.test(opts.since)) {
    throw new HardkasCliError("ARTIFACT_VERIFY_SINCE_INVALID", `--since '${opts.since}' is not a block hash (64 hex)`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const subject = artifactNetworkSubject(artifact);

  // Never one network read as another: an explicit --network must be the artifact's own (devnet is never simnet).
  if (opts.network !== undefined && subject.networkId && opts.network !== subject.networkId) {
    throw new HardkasCliError(
      "ARTIFACT_NETWORK_MISMATCH",
      `the artifact is for ${subject.networkId}; checking it on ${opts.network} would read one network as another. Nothing was contacted.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  const network = opts.network ?? subject.networkId;

  // Mainnet: integrity offline only. Never a connection, whatever --url says.
  if (core.isMainnetNetworkId(network) || core.isMainnetNetworkId(subject.networkId)) {
    return notCheckedNetworkVerification(
      "MAINNET_NETWORK_CHECK_BLOCKED",
      "mainnet is verified offline only: artifact verify never contacts a mainnet node (not even read-only). Nothing was contacted.",
      { policy }
    );
  }
  if (!core.networkFamilyOf(network)) {
    return notCheckedNetworkVerification("NOT_A_KASPA_L1_NETWORK", `'${network}' is not a Kaspa L1 network id. Nothing was contacted.`, { policy });
  }
  if (subject.simulated) {
    return notCheckedNetworkVerification(
      "SIMULATED_ARTIFACT",
      "a simulated transaction exists on no network: its only node evidence is the simulator's own, labelled SIMULATED. Nothing was contacted.",
      { policy }
    );
  }
  if (subject.reason) {
    return notCheckedNetworkVerification(subject.reason, `a ${subject.schema || "?"} artifact names no transaction to look for. Nothing was contacted.`, { policy });
  }

  // The endpoint, by the shared authority (validated); a public network with none chosen: nothing contacted.
  const { loadHardkasConfig, resolveNodeEndpoint } = await import("@hardkas/config");
  let config: any;
  try {
    config = (await loadHardkasConfig({ workspaceRoot: opts.workspaceRoot })).config;
  } catch {
    config = { networks: {} };
  }
  let rpcUrl: string;
  try {
    rpcUrl = resolveNodeEndpoint({ config, networkId: network, ...(opts.url !== undefined ? { explicitUrl: opts.url } : {}) }).url;
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    if (err?.code === "NETWORK_ENDPOINT_REQUIRED") {
      return notCheckedNetworkVerification("NETWORK_ENDPOINT_REQUIRED", String(err?.message ?? e), { policy });
    }
    throw new HardkasCliError(String(err?.code ?? "NETWORK_ENDPOINT_INVALID"), String(err?.message ?? e), { exitCode: HardkasExitCode.USAGE_ERROR });
  }

  // The node's identity (and, apart, its sync state); never trusted from the artifact.
  const { verifyNodeIdentity } = await import("@hardkas/node-runner");
  const managed = network === "simnet" && norm(rpcUrl) === norm(core.nodeRpcUrl());
  const record = managed ? await verifyNodeIdentity() : await verifyNodeIdentity({ expected: core.endpointNodeExpectation(rpcUrl, network) });
  const node = core.networkIdentityOf(record, network);
  // MAINNET TOTAL LOCKDOWN: the node behind the URL said mainnet in its one identity answer (the transport closed it
  // there): the check is the mainnet one, never an "unreachable" node
  if (record.problems.some((p: string) => /MAINNET_CONNECTION_DISABLED/.test(p))) {
    return notCheckedNetworkVerification(
      "MAINNET_NETWORK_CHECK_BLOCKED",
      `the node at ${node.endpoint} says it serves mainnet (its one identity answer): artifact verify never reads mainnet; nothing else was asked of it.`,
      { policy, node }
    );
  }
  if (!record.observed.server) {
    return notCheckedNetworkVerification("NODE_UNREACHABLE", `no node answered at ${node.endpoint}: ${record.problems.join("; ")}`, { policy, node });
  }
  if (node.nodeType !== "rusty-kaspad") {
    return notCheckedNetworkVerification(
      "NODE_IDENTITY_UNVERIFIED",
      node.nodeType === "simulator" ? "the endpoint is the HardKAS simulator, never a node of a real network" : `the node did not prove its identity: ${node.problems.join("; ")}`,
      { policy, node }
    );
  }

  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  // read-only; the client refuses any connection whose node does not serve this network (NODE-NETWORK-IDENTITY-1)
  const client = new JsonWrpcKaspaClient({ rpcUrl, expectedNetworkId: network, timeoutMs: 15000 });
  try {
    return await verifyArtifactOnNetwork({ subject, client, node, policy, ...(opts.since !== undefined ? { since: opts.since.toLowerCase() } : {}) });
  } finally {
    await client.close().catch(() => {});
  }
}

/** The verdict level an integrity result and a network verification reach together. */
export function verdictLevelOf(integrityOk: boolean, check: { network: { level: string }; consensus: { level: string } }) {
  if (!integrityOk) return "INTEGRITY_FAILED";
  if (check.consensus.level === "CONSENSUS_CONFIRMED") return "CONSENSUS_CONFIRMED";
  if (check.network.level === "NETWORK_OBSERVED") return "NETWORK_OBSERVED";
  return "INTEGRITY_VERIFIED";
}

export function requirementMet(requirement: ArtifactVerifyRequirement, verdict: string): boolean {
  if (verdict === "INTEGRITY_FAILED") return false;
  if (requirement === "integrity") return true;
  if (requirement === "network") return verdict === "NETWORK_OBSERVED" || verdict === "CONSENSUS_CONFIRMED";
  return verdict === "CONSENSUS_CONFIRMED";
}
