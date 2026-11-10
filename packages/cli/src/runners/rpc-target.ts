import { nodeRpcUrl } from "@hardkas/core";

/**
 * HARDKAS-NETWORK-PORTABILITY-1 (C5): where an `rpc` command talks, and which network the node must prove it serves.
 *
 * - `--url` without `--network`: that endpoint, and no identity is required (a raw diagnostic of whatever answers there);
 * - `--network <name>`: the endpoint the workspace declares for that network (or `--url`, when given), resolved by the
 *   shared endpoint authority (a public network with no endpoint the user chose is NETWORK_ENDPOINT_REQUIRED, nothing
 *   contacted), and the node must serve that network (NODE-NETWORK-IDENTITY-1) before anything is read from it;
 * - neither (L1-CORE-1 B2 · H1, replacing RPC-DEFAULT-TARGET-NOTE-1's note): in a workspace whose network is a node
 *   network, as `--network <the workspace's network>`; outside a workspace or in the simulator, the canonical localnet,
 *   unchecked.
 */
export interface RpcTarget {
  url: string;
  /** The network the node must serve; undefined for a raw diagnostic. */
  expectedNetworkId?: string | undefined;
}

export async function resolveRpcTarget(options: { url?: string | undefined; network?: string | undefined }): Promise<RpcTarget> {
  if (!options.network) {
    if (options.url) return { url: options.url };
    // L1-CORE-1 B2 · H1 (TN10-24): in a workspace whose network is a node network, the command checks THAT network, as
    // `--network <it>` would: its declared endpoint, the node's identity, and NETWORK_ENDPOINT_REQUIRED (nothing contacted)
    // for a public network that declares none — never the canonical localnet. Outside a workspace, or in the simulator,
    // the raw diagnostic of the canonical localnet stays.
    const workspaceNetwork = await workspaceNodeNetwork();
    if (workspaceNetwork) return resolveRpcTarget({ network: workspaceNetwork });
    return { url: nodeRpcUrl() };
  }
  const { loadHardkasConfig, resolveNodeEndpoint } = await import("@hardkas/config");
  const { config } = await loadHardkasConfig();
  const entry = (config.networks as Record<string, { network?: unknown }> | undefined)?.[options.network];
  const expectedNetworkId = typeof entry?.network === "string" ? entry.network : options.network;
  // SIM-NO-NODE-1: the simulated network executes in this process and has no node. Without an endpoint the caller chose,
  // the endpoint authority would give it a node network's local default — the canonical localnet, possibly another
  // session's node on this machine: refused, typed, before any connection
  if (expectedNetworkId === "simulated" && !options.url) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "SIMULATOR_HAS_NO_NODE",
      `Network '${options.network}' is the HardKAS simulator: it executes in this process and has no Kaspa node to talk to. ` +
        `Use --network with a node network (simnet, testnet-10, …) or pass --url. Nothing was contacted.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  const { url } = resolveNodeEndpoint({ config, networkId: options.network, explicitUrl: options.url });
  return { url, expectedNetworkId };
}

/**
 * H1: the workspace's network (its execution default's, else `defaultNetwork`) when a workspace config file exists and
 * names a node network; undefined outside a workspace, for the simulator, or when the config cannot be read. (It
 * replaces RPC-DEFAULT-TARGET-NOTE-1's stderr note, which said the canonical localnet was checked instead.)
 */
async function workspaceNodeNetwork(): Promise<string | undefined> {
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    const loaded: { path?: string; config: any } = await loadHardkasConfig();
    if (!loaded.path) return undefined;
    const config = loaded.config;
    const exec: any = config?.execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    const name: string | undefined = typeof target?.network === "string" ? target.network : config?.defaultNetwork;
    if (!name) return undefined;
    const entry = (config.networks as any)?.[name] as { network?: unknown; kind?: unknown } | undefined;
    const network = typeof entry?.network === "string" ? entry.network : name;
    if (network === "simulated" || entry?.kind === "simulated" || target?.mode === "simulator") return undefined;
    return name;
  } catch {
    // no readable workspace config: the raw diagnostic
    return undefined;
  }
}

export const RPC_NETWORK_OPTION =
  "Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked)";
