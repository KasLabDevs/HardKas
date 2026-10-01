import { describe, it, expect } from "vitest";
import { KaspaJsonRpcClient } from "../src/json-rpc-client";
import { fakeOfficialRpc, nodeError } from "./helpers/fake-official-rpc.js";

describe("KaspaJsonRpcClient", () => {
  const url = "http://localhost:18210";

  it("should call getServerInfo correctly", async () => {
    const rpc = fakeOfficialRpc({
      getInfo: () => ({ networkId: "simnet", serverVersion: "1.0.0", isSynced: true })
    });
    const client = new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory });

    const info = await client.getServerInfo();

    // The node's wRPC JSON endpoint: http:// names it, the official client speaks ws://.
    expect(rpc.urls).toEqual(["ws://localhost:18210"]);
    expect(rpc.calls[0]!.method).toBe("getInfo");
    expect(info.networkId).toBe("simnet");
    expect(info.serverVersion).toBe("1.0.0");
    expect(info.isSynced).toBe(true);
  });

  it("should call getBlockDagInfo correctly and map virtualDaaScore to BigInt", async () => {
    const rpc = fakeOfficialRpc({
      getBlockDagInfo: () => ({
        network: "simnet",
        virtualDaaScore: 123456n,
        tipHashes: ["abc", "def"],
        blockCount: 100n,
        headerCount: 100n,
        difficulty: 1,
        pastMedianTime: 1000n,
        virtualParentHashes: ["abc"],
        pruningPointHash: "abc",
        sink: "abc"
      })
    });
    const client = new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory });

    const dag = await client.getBlockDagInfo();

    expect(dag.networkId).toBe("simnet");
    expect(dag.virtualDaaScore).toBe(123456n);
    expect(dag.tipHashes).toEqual(["abc", "def"]);
  });

  it("should throw error if the node returns an error", async () => {
    const rpc = fakeOfficialRpc({
      getInfo: () => {
        throw nodeError("Method not found");
      }
    });
    const client = new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory });

    await expect(client.getServerInfo()).rejects.toThrow("Method not found");
  });

  it("should call submitTransaction correctly", async () => {
    const rpc = fakeOfficialRpc({ submitTransaction: () => ({ transactionId: "new-txid-123" }) });
    const client = new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory });

    const result = await client.submitTransaction({
      version: 0,
      inputs: [{ previousOutpoint: { transactionId: "ab".repeat(32), index: 1 }, signatureScript: "41", sequence: 0, sigOpCount: 1 }],
      outputs: [{ amount: 1000, scriptPublicKey: { version: 0, scriptPublicKey: "20aa" } }],
      lockTime: 0,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0,
      payload: "",
      storageMass: 0
    });

    expect(rpc.calls[0]!.method).toBe("submitTransaction");
    const sent = (rpc.calls[0]!.request as any).transaction;
    expect(sent.outputs[0]).toEqual({ value: 1000n, scriptPublicKey: "000020aa" });
    expect(sent.inputs[0].sequence).toBe(0n);
    expect(result.transactionId).toBe("new-txid-123");
  });
});
