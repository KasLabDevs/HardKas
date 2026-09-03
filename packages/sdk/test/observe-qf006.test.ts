import { describe, it, expect } from "vitest";
import { RpcObserverBackend } from "../src/observe/backends.js";

describe("QF-006: RpcObserverBackend Address-Scoped Mempool Route", () => {
  it("QF-006: REAL RpcObserverBackend calls getMempoolEntriesByAddressesRequest with addresses array", async () => {
    let rpcMethodCalled = "";
    let rpcParamsCalled: any = null;

    const mockSdk = {
      rpc: {
        call: async (method: string, params: any) => {
          if (method === "getMempoolEntriesByAddressesRequest") {
            rpcMethodCalled = method;
            rpcParamsCalled = params;
            return {
              entries: [
                {
                  transaction: {
                    verboseData: { transactionId: "tx-mempool-123" },
                    inputs: [{ index: 0 }],
                    outputs: [{ value: "5000000000", verboseData: { scriptPublicKeyAddress: "kaspasim:target-address-1" } }]
                  }
                }
              ]
            };
          }
          if (method === "getUtxosByAddressesRequest") {
            return { entries: [] };
          }
          throw new Error(`Unexpected RPC call: ${method}`);
        },
        getBlockDagInfo: async () => {
          return { virtualDaaScore: 100n };
        }
      }
    };

    const backend = new RpcObserverBackend(mockSdk as any, { mode: "localnet", domain: "test" } as any);
    const targetAddr = "kaspasim:target-address-1";

    const snapshot = await backend.observeAddress(targetAddr);

    // 1. Verify address-scoped RPC route was invoked (NOT global getMempoolEntriesRequest!)
    expect(rpcMethodCalled).toBe("getMempoolEntriesByAddressesRequest");

    // 2. Verify exact protobuf payload structure upstream
    expect(rpcParamsCalled).toEqual({
      addresses: [targetAddr],
      includeOrphanPool: false,
      filterTransactionPool: false
    });

    // 3. Verify snapshot mempool entries mapped incoming transaction
    expect(snapshot.mempool.incoming.length).toBe(1);
    expect(snapshot.mempool.incoming[0].transactionId).toBe("tx-mempool-123");
    expect(snapshot.totals.mempoolIncomingSompi).toBe(5000000000n);
  });
});
