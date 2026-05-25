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
  let name = network || config.defaultNetwork || "simulated";
  
  // P1: simnet deprecation and alias
  if (name === "simnet") {
    console.warn("\x1b[33m%s\x1b[0m", "WARNING: The 'simnet' network alias is deprecated. It will be removed in the next breaking release. Resolving to 'simulated'.");
    name = "simulated";
  }
  
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
