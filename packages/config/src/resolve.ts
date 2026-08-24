import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig, HardkasNetworkTarget, HardkasExecutionTarget } from "./types";

export interface ResolveExecutionTargetOptions {
  config: HardkasConfig;
  network?: string;
  execution?: HardkasExecutionTarget;
  targetName?: string;
}

import { NetworkId } from "@hardkas/core";

export function resolveExecutionTarget(options: ResolveExecutionTargetOptions): {
  name: NetworkId;
  target: HardkasNetworkTarget;
  execution: HardkasExecutionTarget;
} {
  const { config, execution } = options;

  let finalExecution: HardkasExecutionTarget | undefined = execution;
  if (!finalExecution && config.execution) {
    if ("default" in config.execution && "targets" in config.execution) {
      const tName = options.targetName || config.execution.default;
      const targetObj = (config.execution.targets as any)[tName];
      if (!targetObj) {
        throw new Error(`Execution target '${tName}' not found in hardkas.config.ts`);
      }
      finalExecution = targetObj;
    } else {
      if (options.targetName) {
        throw new Error(`Cannot select --target '${options.targetName}' because hardkas.config.ts uses legacy single-target execution mode.`);
      }
      finalExecution = config.execution as HardkasExecutionTarget;
    }
  }

  let name = options.network || finalExecution?.network || config.defaultNetwork || "simulated";

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

  if (!finalExecution) {
    // Inference for backwards compatibility
    if (config.defaultNetwork !== undefined) {
      console.warn(`DEPRECATED: 'defaultNetwork: "${config.defaultNetwork}"' is deprecated. Please migrate to the explicit 'execution' contract in HardkasConfig.`);
    }

    if (name === "simulated") {
      finalExecution = { mode: "simulator", domain: "kaspa-l1", network: "simulated" };

    } else if (target.kind === "igra") {
      finalExecution = { mode: "rpc", domain: "evm-l2", network: name };

    } else if (name === "simnet" || name === "devnet") {
      finalExecution = { mode: "localnet", domain: "kaspa-l1", network: name };

    } else {
      finalExecution = { mode: "rpc", domain: "kaspa-l1", network: name };

    }
  }
  


  return {
    name: name as NetworkId,
    target,
    execution: finalExecution
  };
}
