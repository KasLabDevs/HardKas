export type ProviderMode = "simulator" | "rpc";

export interface ResolveProviderOptions {
  network: string;
  provider?: string | undefined;
  url?: string | undefined;
  configNetworkKind?: "simulated" | "kaspa-node" | "kaspa-rpc" | string | undefined;
  executionMode?: string | undefined;
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

  // 2. Explicit provider string
  if (provider === "rpc") {
    return {
      mode: "rpc",
      network
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
      return { mode: "rpc", network, endpoint: "http://127.0.0.1:18210" };
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

  // Default to RPC for unknown or real networks
  return {
    mode: "rpc",
    network
  };
}
