import { assertMainnetConnectionsDisabled, declaredNetworkIdOf, mainnetConnectionDisabledError } from "@hardkas/core";
import type { KaspaRpcClient } from "@hardkas/kaspa-rpc";

/*
 * MAINNET TOTAL LOCKDOWN (@hardkas/core mainnet-policy) · the SDK's share of the common layer.
 *
 * `Hardkas.open` on a mainnet network (any spelling, or an alias whose entry declares one) opens an OFFLINE instance:
 * the endpoint authority gives it no endpoint (MAINNET_CONNECTION_DISABLED, @hardkas/config resolveNodeEndpoint), so
 * its `rpc` is the client below — it never connects anywhere and refuses every request with the same typed error. What
 * needs no node keeps working on such an instance (artifact integrity checks, local records, address derivation);
 * signing and broadcasting are refused by their own guards first (MAINNET_SIGNING_DISABLED / MAINNET_BROADCAST_DISABLED,
 * before any connection or signer call); every other operation that would reach a node is refused by
 * `assertSdkMayConnect` at its entry (so a path that would swallow a failed read cannot turn the refusal into a fallback,
 * a timeout or an "unknown"), and by this client in any case.
 */

/** The RPC client of a mainnet instance: no endpoint, no connection, every request refused (MAINNET_CONNECTION_DISABLED). */
export function mainnetLockedRpc(networkId: string): KaspaRpcClient & { readonly mainnetLocked: true } {
  const target = { mainnetLocked: true as const };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "mainnetLocked") return true;
      // not a thenable, not an endpoint, nothing to release
      if (prop === "then" || prop === "url" || prop === "getUrl" || prop === "rpcUrl" || typeof prop === "symbol") return undefined;
      if (prop === "close" || prop === "disconnect") return async () => {};
      if (prop in t) return (t as Record<string, unknown>)[prop as string];
      return async () => {
        throw mainnetConnectionDisabledError(`the RPC client of a '${networkId}' instance`, { networkId });
      };
    }
  }) as unknown as KaspaRpcClient & { readonly mainnetLocked: true };
}

/** Whether a client is the one above. */
export function isMainnetLockedRpc(rpc: unknown): boolean {
  return (rpc as { mainnetLocked?: unknown } | null | undefined)?.mainnetLocked === true;
}

interface SdkLike {
  readonly network?: unknown;
  readonly config?: { readonly config?: unknown } | undefined;
}

/**
 * Refuses (MAINNET_CONNECTION_DISABLED, before anything is read) an SDK operation that would reach a node, when the
 * instance's network — its name or what its config entry declares — or any network the operation names is mainnet.
 * A partial instance (a module built on a stand-in, with no config) is judged on what it has.
 */
export function assertSdkMayConnect(sdk: SdkLike, context: string, ...networks: unknown[]): void {
  const config = sdk?.config?.config;
  const own = typeof sdk?.network === "string" ? sdk.network : undefined;
  const named = networks.flatMap((n) => (typeof n === "string" ? [n, declaredNetworkIdOf(config, n)] : []));
  assertMainnetConnectionsDisabled([own, declaredNetworkIdOf(config, own), ...named], context);
}
