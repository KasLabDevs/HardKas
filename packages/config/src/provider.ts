import { nodeRpcUrl } from "@hardkas/core";

export type ProviderMode = "simulator" | "rpc";

export interface ResolveProviderOptions {
  network: string;
  provider?: string | undefined;
  url?: string | undefined;
  configNetworkKind?: "simulated" | "kaspa-node" | "kaspa-rpc" | string | undefined;
  executionMode?: string | undefined;
  /**
   * WORKSPACE-AUTHORITY-2 (closeout): the endpoint the resolved network declares (`resolveWorkspaceExecution(...).rpcUrl`).
   * An explicit `url` still wins; without one, a declared endpoint is the destination — the canonical localnet is the
   * default of the localnet mode only when the network declares none, never a substitute for what it declares.
   */
  networkRpcUrl?: string | undefined;
}

export interface ResolvedProvider {
  mode: ProviderMode;
  network: string;
  endpoint?: string;
}

/**
 * Resolves the appropriate provider mode and endpoint.
 * Priority: --url > --provider > --network alias
 */
export function resolveProvider(options: ResolveProviderOptions): ResolvedProvider {
  const { network, provider, url } = options;

  if (provider === "simulated" && url) {
    throw new Error(
      "PROVIDER_CONFLICT: Simulated backend cannot be used with explicit RPC URL"
    );
  }

  // 1. Explicit URL -> RPC mode
  if (url) {
    return {
      mode: "rpc",
      network,
      endpoint: url
    };
  }

  const declared = options.networkRpcUrl ? { endpoint: options.networkRpcUrl } : {};

  // 2. Explicit provider string
  if (provider === "rpc") {
    return {
      mode: "rpc",
      network,
      ...declared
    };
  }
  if (provider === "simulated") {
    return {
      mode: "simulator",
      network
    };
  }

  // 3. Fallback to executionMode logic
  if (options.executionMode) {
    if (options.executionMode === "simulator") {
      return { mode: "simulator", network };
    }
    if (options.executionMode === "localnet") {
      // The endpoint the network declares; CANONICAL-RPC-URL: the canonical localnet endpoint from @hardkas/core (never
      // a copy) only when it declares none (WORKSPACE-AUTHORITY-2 closeout: never a silent substitute).
      return { mode: "rpc", network, endpoint: options.networkRpcUrl ?? nodeRpcUrl() };
    }
  }

  // 4. Fallback to network alias logic
  if (network === "local" || network === "simulated") {
    return {
      mode: "simulator",
      network
    };
  }

  // 4. Fallback to config kind
  if (options.configNetworkKind === "simulated") {
    return {
      mode: "simulator",
      network
    };
  }

  // Default to RPC for unknown or real networks (with the endpoint the network declares, when it declares one)
  return {
    mode: "rpc",
    network,
    ...declared
  };
}
