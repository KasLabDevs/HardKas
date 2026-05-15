import { describe, it, expect, vi } from "vitest";
import { forkFromNetwork } from "@hardkas/localnet";
import { MockKaspaRpcClient } from "@hardkas/kaspa-rpc";

describe("localnet fork engine", () => {
  it("creates state from mocked UTXO response", async () => {
    const mockRpc = new MockKaspaRpcClient("testnet-11" as any);
    const address = "kaspa:address1";
    
    mockRpc.setUtxos(address, [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        address,
        amountSompi: 1000000000n,
        blockDaaScore: 5000n
      }
    ]);

    const state = await forkFromNetwork(mockRpc, {
      network: "testnet-11",
      rpcUrl: "mock://local",
      addresses: [address]
    });

    expect(state.networkId).toBe("testnet-11");
    expect(state.utxos.length).toBe(1);
    expect(state.utxos[0].amountSompi).toBe("1000000000");
    expect(state.accounts[0].address).toBe(address);
    expect(state.forkSource?.network).toBe("testnet-11");
  });

  it("fork metadata is preserved in state", async () => {
    const mockRpc = new MockKaspaRpcClient();
    const state = await forkFromNetwork(mockRpc, {
      network: "simnet",
      rpcUrl: "mock://local",
      addresses: ["addr1"]
    });

    expect(state.forkSource).toBeDefined();
    expect(state.forkSource?.addresses).toContain("addr1");
    expect(state.forkSource?.rpcUrl).toBe("mock://local");
  });
});
