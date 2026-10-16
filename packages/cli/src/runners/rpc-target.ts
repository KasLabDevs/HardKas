import { nodeRpcUrl } from "@hardkas/core";

/**
 * HARDKAS-NETWORK-PORTABILITY-1 (C5): where an `rpc` command talks, and which network the node must prove it serves.
 *
 * - no `--network`: the explicit `--url`, else the canonical localnet — unchanged, and no identity is required (a raw
 *   diagnostic of whatever answers there);
 * - `--network <name>`: the endpoint the workspace declares for that network (or `--url`, when given), resolved by the
 *   shared endpoint authority (a public network with no endpoint the user chose is NETWORK_ENDPOINT_REQUIRED, nothing
 *   contacted), and the node must serve that network (NODE-NETWORK-IDENTITY-1) before anything is read from it.
 */
export interface RpcTarget {
  url: string;
  /** The network the node must serve; undefined for a raw diagnostic. */
  expectedNetworkId?: string | undefined;
}

export async function resolveRpcTarget(options: { url?: string | undefined; network?: string | undefined }): Promise<RpcTarget> {
  if (!options.network) return { url: options.url || nodeRpcUrl() };
  const { loadHardkasConfig, resolveNodeEndpoint } = await import("@hardkas/config");
  const { config } = await loadHardkasConfig();
  const entry = (config.networks as Record<string, { network?: unknown }> | undefined)?.[options.network];
  const expectedNetworkId = typeof entry?.network === "string" ? entry.network : options.network;
  const { url } = resolveNodeEndpoint({ config, networkId: options.network, explicitUrl: options.url });
  return { url, expectedNetworkId };
}

export const RPC_NETWORK_OPTION =
  "Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: none — the --url or the canonical localnet, unchecked)";
