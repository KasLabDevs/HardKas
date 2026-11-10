import { assertMainnetConnectionsDisabled, assertMainnetTransactionsDisabled, declaredNetworkIdOf } from "@hardkas/core";

/*
 * MAINNET TOTAL LOCKDOWN · the CLI's share of the common layer: the mainnet decision comes FIRST, before a network
 * name is resolved as a HardKAS network (UNKNOWN_NETWORK, RUN_NETWORK_UNKNOWN, EXECUTION_NETWORK_MISMATCH…) and before
 * the public-network gate (PUBLIC_NETWORK_BLOCKED). Every spelling of mainnet (`mainnet`, `mainnet-<n>`, `kaspa`,
 * `kaspa-mainnet[-<n>]`, any case) and every config entry that declares one (an alias such as `prod`) gets the
 * lockdown's own typed code, in the order of @hardkas/core mainnet-policy: a signature MAINNET_SIGNING_DISABLED, a
 * broadcast MAINNET_BROADCAST_DISABLED, anything else that would reach a node MAINNET_CONNECTION_DISABLED. Nothing
 * here reads the network: it only looks at names and at the workspace configuration.
 */

type AnyConfig = Record<string, any> | undefined;

/** The network of the workspace's own execution target: its `execution.default` target, a single `execution`, else `defaultNetwork`. */
export function workspaceNetworkOf(config: AnyConfig): string | undefined {
  const exec = config?.execution;
  const target = exec?.default ? exec.targets?.[exec.default] : exec?.network ? exec : undefined;
  const name = typeof target?.network === "string" ? target.network : config?.defaultNetwork;
  return typeof name === "string" && name.trim() !== "" ? name : undefined;
}

/** The network a named execution target runs on, when the config has that target. */
export function targetNetworkOf(config: AnyConfig, targetName: string | undefined): string | undefined {
  const n = targetName ? config?.execution?.targets?.[targetName]?.network : undefined;
  return typeof n === "string" ? n : undefined;
}

/**
 * Every network identity an invocation names, as written and as its config entry declares it. When no name is given
 * (`names` all undefined) and `workspaceDefault` is set, the workspace's own network stands for it.
 */
export function namedNetworks(config: AnyConfig, names: ReadonlyArray<unknown>, workspaceDefault = false): string[] {
  const given = names.filter((n): n is string => typeof n === "string" && n.trim() !== "");
  const all = given.length === 0 && workspaceDefault ? [workspaceNetworkOf(config)].filter((n): n is string => !!n) : given;
  return all.flatMap((n) => [n, declaredNetworkIdOf(config, n) ?? n]);
}

/** Loads the workspace configuration for the guard; a workspace without one (or one that does not load) has none. */
export async function workspaceConfigForGuard(workspaceRoot?: string): Promise<AnyConfig> {
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    return (await loadHardkasConfig(workspaceRoot ? { workspaceRoot } : {})).config as AnyConfig;
  } catch {
    return undefined;
  }
}

/** MAINNET_CONNECTION_DISABLED for an operation that would reach a node, before any name is resolved. */
export function refuseMainnetConnection(config: AnyConfig, names: ReadonlyArray<unknown>, context: string, workspaceDefault = false): void {
  assertMainnetConnectionsDisabled(namedNetworks(config, names, workspaceDefault), context);
}

/** MAINNET_BROADCAST_DISABLED for a send, before any name is resolved, any confirmation is asked or any node is read. */
export function refuseMainnetBroadcast(config: AnyConfig, names: ReadonlyArray<unknown>, context: string, workspaceDefault = false): void {
  assertMainnetTransactionsDisabled("broadcast", namedNetworks(config, names, workspaceDefault), context);
}

/** MAINNET_SIGNING_DISABLED for a signature, before any account, target or node is resolved. */
export function refuseMainnetSigning(config: AnyConfig, names: ReadonlyArray<unknown>, context: string): void {
  assertMainnetTransactionsDisabled("sign", namedNetworks(config, names), context);
}
