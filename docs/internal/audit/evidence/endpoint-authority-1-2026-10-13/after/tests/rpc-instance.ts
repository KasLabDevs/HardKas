/**
 * ENDPOINT-AUTHORITY-1 test seam. Hermetic tests reach send()'s real branch with a simulator-created instance whose
 * client calls are scripted stand-ins. The SDK now refuses an explicit endpoint on a simulator instance (EA-I4) and an
 * endpoint its client does not name (EA-I2), so the instance is made what those tests mean it to be: an RPC instance
 * whose client says it talks to `url` (nothing leaves the process — every client call the test makes is a stand-in).
 */
export function asRpcInstance(sdk: any, url: string, network: string = String(sdk.network)): void {
  Object.defineProperty(sdk, "network", { get: () => network, configurable: true });
  Object.defineProperty(sdk, "execution", { value: { mode: "rpc", domain: "kaspa-l1", network }, configurable: true, writable: true });
  withClientUrl(sdk, url);
}

/**
 * `sdk.tx.send(signed, url)` as an RPC instance whose client talks to `url` (see asRpcInstance), for that send only:
 * the instance is given back exactly as it was (a test that goes on to use it as the simulator still can).
 */
export async function sendAsRpc(sdk: any, signed: any, url: string, network?: string): Promise<any> {
  const own = (o: any, k: string) => Object.getOwnPropertyDescriptor(o, k);
  const saved = { network: own(sdk, "network"), execution: own(sdk, "execution"), url: own(sdk.rpc, "url") };
  asRpcInstance(sdk, url, network);
  try {
    return await sdk.tx.send(signed, url);
  } finally {
    const restore = (o: any, k: string, d: PropertyDescriptor | undefined) => (d ? Object.defineProperty(o, k, d) : delete o[k]);
    restore(sdk, "network", saved.network);
    restore(sdk, "execution", saved.execution);
    restore(sdk.rpc, "url", saved.url);
  }
}

/** The instance's client says it talks to `url` (its own endpoint, what a record names). */
export function withClientUrl(sdk: any, url: string): void {
  Object.defineProperty(sdk.rpc, "url", { value: url, configurable: true, writable: true });
}
