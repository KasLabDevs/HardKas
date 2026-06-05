export type ProviderMode = "simulated" | "rpc";

export interface ResolveProviderOptions {
  network: string;
  provider?: string | undefined;
  url?: string | undefined;
  configNetworkKind?: "simulated" | "kaspa-node" | "kaspa-rpc" | string | undefined;
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

  // 1. Explicit URL -> RPC mode
  if (url) {
    return {
      mode: "rpc",
      network,
      endpoint: url,
    };
  }

  // 2. Explicit provider string
  if (provider === "rpc") {
    return {
      mode: "rpc",
      network,
    };
  }
  if (provider === "simulated") {
    return {
      mode: "simulated",
      network,
    };
  }

  // 3. Fallback to network alias logic (simnet defaults to simulated without an explicit URL/provider)
  if (network === "simnet" || network === "local" || network === "simulated") {
    return {
      mode: "simulated",
      network,
    };
  }

  // 4. Fallback to config kind
  if (options.configNetworkKind === "simulated") {
    return {
      mode: "simulated",
      network,
    };
  }

  // Default to RPC for unknown or real networks
  return {
    mode: "rpc",
    network,
  };
}
