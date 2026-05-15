import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig, HardkasNetworkTarget } from "./types";

export interface ResolveNetworkTargetOptions {
  config: HardkasConfig;
  network?: string;
}

import { NetworkId } from "@hardkas/core";

export function resolveNetworkTarget(
  options: ResolveNetworkTargetOptions
): {
  name: NetworkId;
  target: HardkasNetworkTarget;
} {
  const { config, network } = options;
  const name = network || config.defaultNetwork || "simnet";
  
  const networks = {
    ...DEFAULT_HARDKAS_CONFIG.networks,
    ...(config.networks || {})
  };

  const target = networks[name];

  if (!target) {
    const available = Object.keys(networks).join(", ");
    throw new Error(`Unknown HardKAS network '${name}'. Available networks: ${available}`);
  }

  return {
    name: name as NetworkId,
    target
  };
}
