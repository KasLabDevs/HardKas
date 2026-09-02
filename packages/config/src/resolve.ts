import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig, HardkasNetworkTarget, HardkasExecutionTarget } from "./types";

export interface ResolveExecutionTargetOptions {
  config: HardkasConfig;
  network?: string;
  execution?: HardkasExecutionTarget;
  targetName?: string;
}

import { NetworkId, ExecutionTargetUnresolvedError, LegacyArtifactRequiresExplicitResolutionError } from "@hardkas/core";

/**
 * @deprecated Use `resolveNewIntentTarget`, `resolveArtifactTarget`, or `resolveLegacyArtifactTarget` explicitly.
 */
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

export function resolveNewIntentTarget(options: {
  config: HardkasConfig;
  explicitTarget?: HardkasExecutionTarget;
}): HardkasExecutionTarget {
  const { config, explicitTarget } = options;

  if (explicitTarget) {
    return explicitTarget;
  }

  if (config.execution) {
    if ("default" in config.execution && "targets" in config.execution) {
      const defaultName = config.execution.default;
      const targetObj = (config.execution.targets as any)[defaultName];
      if (targetObj) {
        return targetObj as HardkasExecutionTarget;
      }
    } else {
      return config.execution as HardkasExecutionTarget;
    }
  }

  if (config.defaultNetwork) {
    // Inference for legacy config
    const name = config.defaultNetwork === "simnet" && config.networks?.simnet?.kind === "simulated"
      ? "simulated"
      : config.defaultNetwork;

    if (name === "simulated") {
      return { mode: "simulator", domain: "kaspa-l1", network: "simulated" };
    } else if (config.networks?.[name]?.kind === "igra") {
      return { mode: "rpc", domain: "evm-l2", network: name };
    } else if (name === "simnet" || name === "devnet") {
      return { mode: "localnet", domain: "kaspa-l1", network: name };
    } else {
      return { mode: "rpc", domain: "kaspa-l1", network: name };
    }
  }

  throw new ExecutionTargetUnresolvedError({
    message: "No explicit target, execution default, or defaultNetwork found."
  });
}

// Minimal interface to avoid depending on @hardkas/core artifact concrete types
export interface ExecutionAwareArtifactConfig {
  execution?: HardkasExecutionTarget;
}

export function resolveArtifactTarget(options: {
  artifact: ExecutionAwareArtifactConfig;
}): { target: HardkasExecutionTarget; source: "recorded" } {
  if (!options.artifact.execution) {
    throw new LegacyArtifactRequiresExplicitResolutionError();
  }

  return { target: options.artifact.execution, source: "recorded" };
}

export function resolveLegacyArtifactTarget(options: {
  artifact: ExecutionAwareArtifactConfig;
  config: HardkasConfig;
}): { target: HardkasExecutionTarget; source: "legacy-inferred" } {
  if (options.artifact.execution) {
    // If it has one, it shouldn't be using legacy resolution, but we can return it.
    return { target: options.artifact.execution, source: "legacy-inferred" }; // Or we could throw an error saying it's not a legacy artifact.
  }

  // Fallback to config default logic
  const inferred = resolveNewIntentTarget({ config: options.config });
  return { target: inferred, source: "legacy-inferred" };
}
