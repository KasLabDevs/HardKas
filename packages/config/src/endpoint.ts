import { HardkasError, nodeRpcUrl, assertValidNodeEndpoint } from "@hardkas/core";
import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig } from "./types";

// TESTNET-PORT-COLLISION-1 (review 2026-10-14, D-TPC-1/2/4): the one authority every client path (SDK, CLI, observer)
// asks for the node endpoint of a network. A client operation never infers that a node exists and is authorized:
//   1. an endpoint the caller gave (`--url`, an explicit option) wins;
//   2. else the endpoint the USER declared for the network (`networks[id].rpcUrl` in hardkas.config.ts);
//   3. else, for a LOCAL network only (simnet, devnet, the simulator), its local default;
//   4. else — a public network (testnet-*, mainnet) with nothing chosen — NETWORK_ENDPOINT_REQUIRED, before any
//      connection. Never the canonical localnet (a simnet node that listens on the upstream testnet default ports) and
//      never a built-in public host: the built-in public entries carry no endpoint at all.
// Starting a node (`node start`, the orchestrator's listen address) is not a client operation and does not use this.

/** A network id served by the public Kaspa networks (where an implicit endpoint is never acceptable). */
export function isPublicKaspaNetwork(networkId: string | undefined): boolean {
  return typeof networkId === "string" && /^(testnet(-\d+)?|mainnet)$/.test(networkId);
}

/** The network a config entry is for: its `network` field (a custom name such as "my-tn10"), else its key. */
function entryNetwork(config: HardkasConfig, networkId: string): string {
  const entry = config.networks?.[networkId] as { network?: unknown } | undefined;
  return typeof entry?.network === "string" ? entry.network : networkId;
}

/**
 * The endpoint declared for a network, if any: a non-empty `rpcUrl`. The built-in entries of the public networks carry
 * none (`rpcUrl: ""`, defaults.ts, D-TPC-2), so a public endpoint exists only where the user wrote one — the same URL
 * a built-in once held included — and no copy, clone or reload of a config can produce one the user did not write.
 * Local built-ins (simnet, devnet) keep theirs.
 */
export function declaredNodeEndpoint(config: HardkasConfig, networkId: string): string | undefined {
  const entry = config.networks?.[networkId] as { rpcUrl?: unknown } | undefined;
  return entry && typeof entry.rpcUrl === "string" && entry.rpcUrl !== "" ? entry.rpcUrl : undefined;
}

export interface ResolvedNodeEndpoint {
  url: string;
  /** Where it came from: given by the caller, declared by the user, or the local default of a local network. */
  source: "explicit" | "declared" | "local-default";
}

/** The local default of a local network, if it has one. */
function localDefault(network: string): string | undefined {
  if (network === "simnet" || network === "simnet-1" || network === "simulated" || network === "local") return nodeRpcUrl();
  if (network === "devnet") {
    const devnet = (DEFAULT_HARDKAS_CONFIG.networks as Record<string, { rpcUrl?: unknown }> | undefined)?.devnet?.rpcUrl;
    return typeof devnet === "string" ? devnet : undefined;
  }
  return undefined;
}

export function networkEndpointRequiredError(networkId: string): HardkasError {
  return new HardkasError(
    "NETWORK_ENDPOINT_REQUIRED",
    `Network '${networkId}' has no node endpoint you chose. Declare it in hardkas.config.ts ` +
      `(networks['${networkId}'].rpcUrl: your own node, e.g. ws://127.0.0.1:<port>, or a public node you select) or pass --url. ` +
      `HardKAS never connects a public network to an endpoint it infers (not the local simnet node, not a built-in public host). ` +
      `Nothing was contacted.`,
    { metadata: { networkId } }
  );
}

/** The node endpoint for a network, by the rules above; throws NETWORK_ENDPOINT_REQUIRED instead of guessing. */
export function resolveNodeEndpoint(options: { config: HardkasConfig; networkId: string; explicitUrl?: string | undefined }): ResolvedNodeEndpoint {
  // ENDPOINT-VALIDATION-1: an endpoint given or declared must be well formed, or nothing connects (NETWORK_ENDPOINT_INVALID)
  if (typeof options.explicitUrl === "string" && options.explicitUrl !== "") {
    return { url: assertValidNodeEndpoint(options.explicitUrl, "--url"), source: "explicit" };
  }
  const declared = declaredNodeEndpoint(options.config, options.networkId);
  if (declared !== undefined) {
    return { url: assertValidNodeEndpoint(declared, `networks['${options.networkId}'].rpcUrl`), source: "declared" };
  }
  const network = entryNetwork(options.config, options.networkId);
  const local = isPublicKaspaNetwork(network) ? undefined : localDefault(network);
  if (local !== undefined) return { url: local, source: "local-default" };
  throw networkEndpointRequiredError(options.networkId);
}
