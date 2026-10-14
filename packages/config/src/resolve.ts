import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { HardkasConfig, HardkasNetworkTarget, HardkasExecutionTarget } from "./types";

export interface ResolveExecutionTargetOptions {
  config: HardkasConfig;
  network?: string;
  execution?: HardkasExecutionTarget;
  targetName?: string;
}

import { NetworkId, HardkasError, ExecutionTargetUnresolvedError, LegacyArtifactRequiresExplicitResolutionError } from "@hardkas/core";

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

// ---------------------------------------------------------------------------
// WORKSPACE-AUTHORITY-2 · the one resolution of a workspace's execution target, shared by the SDK and the CLI.
//
// `execution` (one target, or a default among named targets) is the workspace's authority. On top of it a caller may
// name a TARGET (`execution.targets[name]`: the SDK option `target`, the CLI option `--target`) or a NETWORK id (a key
// of `networks`: the SDK option `network`, the CLI option `--network`). The two are different things: a target named
// "localnet" is not a network called "localnet". Precedence: a target wins; a network must be a known network id and,
// when a declared target names it, that target is taken (else the mode the network implies, the CLI's long-standing
// inference); both together must agree. An unknown name, a missing target or a disagreement is a typed refusal — never
// a fallback to the simulator.
// ---------------------------------------------------------------------------

export interface ResolveWorkspaceExecutionOptions {
  config: HardkasConfig;
  /** A named execution target (`execution.targets[name]`). */
  target?: string | undefined;
  /** A network id (a key of `networks`, built-ins included). Never a target name. */
  network?: string | undefined;
}

export type WorkspaceExecutionSource = "target" | "network" | "execution" | "defaultNetwork";

export interface ResolvedWorkspaceExecution {
  /** The execution target the workspace runs on: mode, domain and network. */
  execution: HardkasExecutionTarget;
  /** `execution.network` after the alias of a `simnet` the config declares simulated (the simulator is "simulated"). */
  networkId: string;
  /** The network's declaration (built-ins merged with the config's); absent only for the simulator. */
  networkTarget: HardkasNetworkTarget | undefined;
  /** What decided: an explicit target, an explicit network, the `execution` contract, or the legacy `defaultNetwork`. */
  source: WorkspaceExecutionSource;
  targetName?: string;
  /**
   * The endpoint the resolved network declares (`networks[networkId].rpcUrl`), when it declares one: the end of the
   * chain target → network → mode → endpoint, the same for the SDK and the CLI. Absent for the simulator and for a
   * network without a declared URL (the callers' documented default applies then: the canonical localnet for the
   * localnet mode).
   */
  rpcUrl?: string;
}

/** The networks a config knows: the built-ins, then its own (a config may redefine a built-in). */
export function knownNetworks(config: HardkasConfig): Record<string, HardkasNetworkTarget> {
  return { ...DEFAULT_HARDKAS_CONFIG.networks, ...(config.networks || {}) } as Record<string, HardkasNetworkTarget>;
}

/** A `simnet` the config declares simulated is the simulator ("simulated"); every other name is itself. */
export function aliasSimulatedNetwork(name: string, networks: Record<string, HardkasNetworkTarget>): string {
  return name === "simnet" && networks.simnet?.kind === "simulated" ? "simulated" : name;
}

/** The execution a known network id implies when no declared target names it (the CLI's long-standing inference). */
function inferExecutionForNetwork(network: string, networks: Record<string, HardkasNetworkTarget>): HardkasExecutionTarget {
  const kind = networks[network]?.kind;
  if (network === "simulated" || kind === "simulated") return { mode: "simulator", domain: "kaspa-l1", network: "simulated" };
  if (kind === "igra") return { mode: "rpc", domain: "evm-l2", network };
  if (network === "simnet" || network === "devnet") return { mode: "localnet", domain: "kaspa-l1", network };
  return { mode: "rpc", domain: "kaspa-l1", network };
}

export function resolveWorkspaceExecution(options: ResolveWorkspaceExecutionOptions): ResolvedWorkspaceExecution {
  const { config } = options;
  const networks = knownNetworks(config);
  const declared = config.execution;
  const targetsForm = declared && "default" in declared && "targets" in declared ? declared : undefined;
  const singleForm = declared && !targetsForm ? (declared as HardkasExecutionTarget) : undefined;
  const targets = (targetsForm?.targets ?? {}) as Record<string, HardkasExecutionTarget>;
  const targetNames = Object.keys(targets);
  const available = () => Object.keys(networks).join(", ");

  let explicit: HardkasExecutionTarget | undefined;
  let source: WorkspaceExecutionSource = declared ? "execution" : "defaultNetwork";
  let targetName: string | undefined;

  if (options.target !== undefined) {
    const found = targets[options.target];
    if (!found) {
      throw new HardkasError(
        "EXECUTION_TARGET_NOT_FOUND",
        `Execution target '${options.target}' not found in hardkas.config.ts` +
          (targetNames.length ? ` (declared targets: ${targetNames.join(", ")}).` : " (the config declares no named targets).")
      );
    }
    explicit = found;
    source = "target";
    targetName = options.target;
  }

  let requestedNetwork: string | undefined;
  if (options.network !== undefined) {
    if (!networks[options.network]) {
      const hint = targetNames.includes(options.network)
        ? ` '${options.network}' is a named execution target, not a network: select it with target.`
        : "";
      throw new HardkasError("UNKNOWN_NETWORK", `Unknown HardKAS network '${options.network}'. Available networks: ${available()}.${hint}`);
    }
    requestedNetwork = aliasSimulatedNetwork(options.network, networks);
    if (!explicit) {
      const sameNetwork = (t: HardkasExecutionTarget) => aliasSimulatedNetwork(t.network, networks) === requestedNetwork;
      const declaredForNetwork = targetsForm
        ? Object.values(targets).find(sameNetwork)
        : singleForm && sameNetwork(singleForm)
          ? singleForm
          : undefined;
      explicit = declaredForNetwork ?? inferExecutionForNetwork(requestedNetwork, networks);
      source = "network";
    }
  }

  if (!explicit && targetsForm && !targets[targetsForm.default]) {
    // the contract's own default must exist: it is never replaced by the legacy key or by the simulator
    throw new HardkasError(
      "EXECUTION_TARGET_NOT_FOUND",
      `execution.default '${targetsForm.default}' names no declared target in hardkas.config.ts (declared targets: ${targetNames.join(", ") || "none"}).`
    );
  }

  const execution = explicit ?? resolveNewIntentTarget({ config });
  const networkId = aliasSimulatedNetwork(execution.network, networks);

  if (requestedNetwork !== undefined && requestedNetwork !== networkId) {
    throw new HardkasError(
      "EXECUTION_NETWORK_MISMATCH",
      `Execution target${targetName ? ` '${targetName}'` : ""} specifies network '${execution.network}', but the command was called with network '${options.network}'.`
    );
  }

  const networkTarget = networks[networkId];
  if (!networkTarget && execution.mode !== "simulator") {
    throw new HardkasError(
      "UNKNOWN_NETWORK",
      `Execution target${targetName ? ` '${targetName}'` : ""} names network '${execution.network}', which hardkas.config.ts does not declare. Available networks: ${available()}.`
    );
  }

  const rpcUrl =
    networkTarget && "rpcUrl" in networkTarget && typeof (networkTarget as { rpcUrl?: unknown }).rpcUrl === "string"
      ? ((networkTarget as { rpcUrl: string }).rpcUrl)
      : undefined;

  return {
    execution,
    networkId,
    networkTarget,
    source,
    ...(targetName !== undefined ? { targetName } : {}),
    ...(rpcUrl !== undefined ? { rpcUrl } : {})
  };
}
