import type { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { networkEndpointRequiredError } from "@hardkas/config";

// TESTNET-PORT-COLLISION-1: the RPC client of an instance whose public network has no endpoint the user chose. It never
// connects anywhere: every request refuses NETWORK_ENDPOINT_REQUIRED (the same error the CLI gives), so the operations
// that need no node (signing, artifacts, verification) keep working on such an instance and every one that needs a node
// is refused before any connection. It names no endpoint (`url` is undefined), so no record can attribute anything to one.

/** Marks an error as "this instance has no endpoint" (tx.send refuses on it before recording anything). */
export function isNetworkEndpointRequired(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "NETWORK_ENDPOINT_REQUIRED";
}

export function unresolvedEndpointRpc(networkId: string): KaspaRpcClient & { readonly endpointUnresolved: true } {
  const target = { endpointUnresolved: true as const };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "endpointUnresolved") return true;
      // not a thenable, not an endpoint, nothing to release
      if (prop === "then" || prop === "url" || prop === "getUrl" || prop === "rpcUrl" || typeof prop === "symbol") return undefined;
      if (prop === "close" || prop === "disconnect") return async () => {};
      if (prop in t) return (t as Record<string, unknown>)[prop as string];
      return async () => {
        throw networkEndpointRequiredError(networkId);
      };
    }
  }) as unknown as KaspaRpcClient & { readonly endpointUnresolved: true };
}
