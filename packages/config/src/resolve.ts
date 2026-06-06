import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig, HardkasNetworkTarget } from "./types";

export interface ResolveNetworkTargetOptions {
  config: HardkasConfig;
  network?: string;
}

import { NetworkId } from "@hardkas/core";

export function resolveNetworkTarget(options: ResolveNetworkTargetOptions): {
  name: NetworkId;
  target: HardkasNetworkTarget;
} {
  const { config, network } = options;
  let name = network || config.defaultNetwork || "simulated";

  // P1: simnet deprecation and alias removed to allow real node testing
  if (name === "simnet" && config.networks?.simnet?.kind === "simulated") {
    name = "simulated";
  }

  const networks = {
    ...DEFAULT_HARDKAS_CONFIG.networks,
    ...(config.networks || {})
  };

  const target = networks[name];

  if (!target) {
    const available = Object.keys(networks).join(", ");
    throw new Error(
      `Unknown HardKAS network '${name}'. Available networks: ${available}`
    );
  }

  return {
    name: name as NetworkId,
    target
  };
}
