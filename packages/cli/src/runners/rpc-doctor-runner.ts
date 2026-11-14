import { UI } from "../ui.js";
import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";
import { loadHardkasConfig, resolveNodeEndpoint } from "@hardkas/config";
import { MAINNET_CONNECTION_DISABLED, isMainnetNetworkId, mainnetConnectionDisabledMessage, redactUrlCredentials } from "@hardkas/core";
import net from "node:net";

export interface RpcDoctorOptions {
  endpoints?: string[];
  config?: string;
}

/**
 * A5 (rc2 audit): the EVM chain ids that are always mainnet. It MIRRORS `KNOWN_MAINNET_CHAIN_IDS` of @hardkas/l2
 * (packages/l2/src/network-guard.ts: 1 = Ethereum mainnet, 38833 = Igra mainnet), which the CLI cannot import (the L2
 * package is not a CLI dependency in this release). Keep the two lists equal.
 */
const L2_MAINNET_CHAIN_IDS: ReadonlySet<number> = new Set([1, 38833]);

/** Whether a config entry (its name and what it declares) is a mainnet, L1 or L2. */
function configDeclaresMainnet(name: string, entry: Record<string, unknown>): boolean {
  const chainId = typeof entry.chainId === "string" ? Number(entry.chainId) : entry.chainId;
  return (
    isMainnetNetworkId(name) ||
    isMainnetNetworkId(entry.network) ||
    entry.environment === "mainnet" ||
    (typeof chainId === "number" && L2_MAINNET_CHAIN_IDS.has(chainId))
  );
}

function mainnetRefused(url: string, contacted: "nothing" | "identity-only"): LayeredHealthResult {
  return {
    tcpReachable: contacted === "identity-only",
    protocolReachable: false,
    rpcReachable: false,
    status: "mainnet_refused",
    error: mainnetConnectionDisabledMessage(`rpc doctor: ${redactUrlCredentials(url)}`, contacted)
  };
}

interface LayeredHealthResult {
  tcpReachable: boolean;
  protocolReachable: boolean;
  rpcReachable: boolean;
  status: "ready" | "tcp_unreachable" | "protocol_error" | "rpc_error" | "unsupported" | "mainnet_refused";
  latencyMs?: number;
  network?: string;
  daaScore?: number;
  version?: string;
  error?: string;
}

async function checkTcpReachable(
  host: string,
  port: number,
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

interface KaspaRpcInfo {
  networkId?: string;
  network?: string;
  virtualDaaScore?: number;
  serverVersion?: string;
  server_version?: string;
}

async function checkKaspaEndpoint(rpcUrl: string): Promise<LayeredHealthResult> {
  // Parse host:port from URL
  let host = "127.0.0.1";
  let port = 18210;
  try {
    const url = new URL(rpcUrl.replace("ws://", "http://").replace("wss://", "https://"));
    host = url.hostname || "127.0.0.1";
    // HARDKAS-NETWORK-PORTABILITY-1 (C5): a URL without a port means its scheme's port (wss/https 443, ws/http 80), not
    // the canonical localnet's 18210 — the TCP probe of a public wss endpoint used to dial <host>:18210
    port = parseInt(url.port) || (url.protocol === "https:" ? 443 : 80);
  } catch (e) {}

  // Layer 1: TCP
  const tcpOk = await checkTcpReachable(host, port);
  if (!tcpOk) {
    return {
      tcpReachable: false,
      protocolReachable: false,
      rpcReachable: false,
      status: "tcp_unreachable"
    };
  }

  // Layer 2: WebSocket protocol
  const client = new KaspaWrpcClient(rpcUrl);
  const start = Date.now();
  try {
    await client.connect(3000);
  } catch (err) {
    await client.disconnect();
    // A5: the transport asked the node its identity and dropped it because it serves mainnet
    if (/MAINNET_CONNECTION_DISABLED/.test(err instanceof Error ? err.message : String(err))) return mainnetRefused(rpcUrl, "identity-only");
    return {
      tcpReachable: true,
      protocolReachable: false,
      rpcReachable: false,
      status: "protocol_error",
      error: err instanceof Error ? ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) : String(err)
    };
  }

  // Layer 3: RPC method call
  try {
    const info = (await client.getServerInfo()) as KaspaRpcInfo;
    const dagInfo = (await client.getBlockDagInfo()) as KaspaRpcInfo;
    const latencyMs = Date.now() - start;
    await client.disconnect();
    return {
      tcpReachable: true,
      protocolReachable: true,
      rpcReachable: true,
      status: "ready",
      latencyMs,
      network:
        dagInfo?.networkId ||
        dagInfo?.network ||
        info?.networkId ||
        info?.network ||
        "unknown",
      daaScore: dagInfo?.virtualDaaScore || info?.virtualDaaScore || 0,
      version: info?.serverVersion || info?.server_version || "unknown"
    };
  } catch (err) {
    await client.disconnect();
    return {
      tcpReachable: true,
      protocolReachable: true,
      rpcReachable: false,
      status: "rpc_error",
      error: err instanceof Error ? ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) : String(err)
    };
  }
}

async function checkHttpJsonRpcEndpoint(url: string): Promise<LayeredHealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 })
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      // A5 (rc2 audit): an EVM mainnet answered its identity (eth_chainId) and nothing else is asked; it is reported as
      // refused, never as "ready"
      const chainId = typeof data.result === "string" && /^0x[0-9a-fA-F]+$/.test(data.result) ? Number.parseInt(data.result, 16) : undefined;
      if (chainId !== undefined && L2_MAINNET_CHAIN_IDS.has(chainId)) {
        return mainnetRefused(url, "identity-only");
      }
      return {
        tcpReachable: true,
        protocolReachable: true,
        rpcReachable: true,
        status: "ready",
        latencyMs,
        network: typeof data.result === "string" ? data.result : "evm-chain",
        daaScore: 0,
        version: "L2 Endpoint"
      };
    } else {
      return {
        tcpReachable: true,
        protocolReachable: false,
        rpcReachable: false,
        status: "protocol_error",
        error: `HTTP error ${res.status}`
      };
    }
  } catch (err) {
    return {
      tcpReachable: false,
      protocolReachable: false,
      rpcReachable: false,
      status: "tcp_unreachable",
      error: err instanceof Error ? ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) : String(err)
    };
  }
}

export interface RpcDoctorResult {
  readonly url: string;
  readonly health: LayeredHealthResult;
}

/**
 * Probes each endpoint and prints its report; returns every endpoint's result. D-09 (rc2 audit): the caller decides the
 * exit code from them (`hardkas rpc doctor` exits 1 when any endpoint is not ready; it used to exit 0 in every case).
 */
export async function runRpcDoctor(options: RpcDoctorOptions): Promise<RpcDoctorResult[]> {
  let endpoints = options.endpoints || [];
  let loadedNetworks: Record<string, unknown> = {};

  const loaded = await loadHardkasConfig(
    options.config ? { configPath: options.config } : {}
  );
  loadedNetworks = (loaded.config.networks || {}) as Record<string, unknown>;

  if (endpoints.length === 0) {
    const defaultNetwork = loaded.config.defaultNetwork || "simnet";
    // TESTNET-PORT-COLLISION-1: the shared endpoint authority — the declared endpoint, else a local network's default
    // (the canonical localnet for simnet), else NETWORK_ENDPOINT_REQUIRED (a public network is never probed on a guess)
    endpoints = [resolveNodeEndpoint({ config: loaded.config, networkId: defaultNetwork }).url];
  }

  UI.header("HardKAS RPC Doctor");
  console.log(`Auditing ${endpoints.length} endpoint(s)...\n`);

  const results: RpcDoctorResult[] = [];

  for (const url of endpoints) {
    // Resolve kind for the url
    let kind = "kaspa-rpc"; // default to Kaspa L1
    const found = Object.entries(loadedNetworks).find(
      ([, n]) =>
        typeof n === "object" &&
        n !== null &&
        (n as Record<string, unknown>).rpcUrl === url
    ) as [string, Record<string, unknown>] | undefined;
    const foundNetwork = found?.[1];
    if (foundNetwork && typeof foundNetwork.kind === "string") {
      kind = foundNetwork.kind;
    } else if (url.startsWith("http://") && !url.includes("18210")) {
      kind = "igra-rpc";
    }

    let result: LayeredHealthResult;
    // A5 (rc2 audit): an endpoint the config declares as a mainnet (by name, by its network, its environment or its
    // chain id) is refused before any TCP or HTTP contact
    if (found && configDeclaresMainnet(found[0], found[1])) {
      result = mainnetRefused(url, "nothing");
    } else if (kind === "kaspa-rpc" || kind === "kaspa-node") {
      result = await checkKaspaEndpoint(url);
    } else {
      result = await checkHttpJsonRpcEndpoint(url);
    }

    results.push({ url, health: result });

    console.log("┌── RPC HEALTH ────────────────────────────────────────────────");
    console.log(`│ ENDPOINT:   ${redactUrlCredentials(url).padEnd(48)} │`);
    if (result.status === "mainnet_refused") {
      console.log(`│ REFUSED:    ${MAINNET_CONNECTION_DISABLED.padEnd(48)} │`);
      console.log(`│ STATUS:     ${result.status.padEnd(48)} │`);
      console.log(`│ CONTACTED:  ${(result.tcpReachable ? "identity request only, then closed" : "nothing").padEnd(48)} │`);
      console.log("└──────────────────────────────────────────────────────────────");
      console.log("");
      continue;
    }
    console.log(
      `│ TCP:        ${(result.tcpReachable ? "✅ reachable" : "❌ unreachable").padEnd(48)} │`
    );

    if (result.tcpReachable) {
      console.log(
        `│ PROTOCOL:   ${(result.protocolReachable ? "✅ connected" : "❌ protocol_error (Port reachable, protocol adapter unsupported or protocol mismatch)").padEnd(48)} │`
      );
    } else {
      console.log(`│ PROTOCOL:   ${"❌ skipped".padEnd(48)} │`);
    }

    if (result.protocolReachable) {
      console.log(
        `│ RPC:        ${(result.rpcReachable ? "✅ ready" : "❌ rpc_error").padEnd(48)} │`
      );
      if (!result.rpcReachable && result.error) {
        console.log(`│ ERROR:      ${result.error.slice(0, 45).padEnd(48)} │`);
      }
      console.log(`│ NETWORK:    ${(result.network || "unknown").padEnd(48)} │`);
      console.log(`│ DAA SCORE:  ${(result.daaScore?.toString() || "0").padEnd(48)} │`);
      console.log(`│ VERSION:    ${(result.version || "unknown").padEnd(48)} │`);
      console.log(`│ LATENCY:    ${((result.latencyMs ?? 0) + "ms").padEnd(48)} │`);
    } else {
      console.log(`│ RPC:        ${"⏭️  skipped".padEnd(48)} │`);
      console.log(`│ STATUS:     ${result.status.padEnd(48)} │`);
      if (result.error) {
        console.log(`│ ERROR:      ${result.error.slice(0, 45).padEnd(48)} │`);
      }
    }
    console.log("└──────────────────────────────────────────────────────────────");
    console.log("");
  }
  return results;
}
