import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig, HardkasNetworkTarget, HardkasExecutionTarget } from "./types";

export interface ResolveExecutionTargetOptions {
  config: HardkasConfig;
  network?: string;
  execution?: HardkasExecutionTarget;
}

import { NetworkId } from "@hardkas/core";

export function resolveExecutionTarget(options: ResolveExecutionTargetOptions): {
  name: NetworkId;
  target: HardkasNetworkTarget;
  execution: HardkasExecutionTarget;
} {
  const { config, network, execution } = options;

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

  let finalExecution: HardkasExecutionTarget;
  if (execution) {
    finalExecution = execution;
  } else if (config.execution) {
    finalExecution = config.execution;
  } else {
    // Inference for backwards compatibility
    if (config.defaultNetwork !== undefined) {
      console.warn(`DEPRECATED: 'defaultNetwork: "${config.defaultNetwork}"' is deprecated. Please migrate to the explicit 'execution' contract in HardkasConfig.`);
    }

    if (name === "simulated") {
      finalExecution = { mode: "simulator", domain: "kaspa-l1", network: "simulated" };
      console.log("DEBUG: resolved name === simulated", finalExecution);
    } else if (target.kind === "igra") {
      finalExecution = { mode: "rpc", domain: "evm-l2", network: name };
      console.log("DEBUG: resolved target.kind === igra", finalExecution);
    } else if (name === "simnet" || name === "devnet") {
      finalExecution = { mode: "localnet", domain: "kaspa-l1", network: name };
      console.log("DEBUG: resolved name === simnet|devnet", finalExecution);
    } else {
      finalExecution = { mode: "rpc", domain: "kaspa-l1", network: name };
      console.log("DEBUG: resolved else", finalExecution);
    }
  }
  


  return {
    name: name as NetworkId,
    target,
    execution: finalExecution
  };
}
