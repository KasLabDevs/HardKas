import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import { MockRpcProvider } from "./mock-rpc";

class MockStore {
  async get() { return null; }
  async put() {}
  async delete() {}
  async clear() {}
}

describe("W2 - Concurrent Planner Collision (Read Only)", () => {
  let hk: Hardkas;
  let provider: MockRpcProvider;

  beforeAll(async () => {
    provider = new MockRpcProvider();
    hk = await Hardkas.create({
      network: "simnet",
      autoBootstrap: true,
      policy: { allowPublic: true },
      rpc: {
        provider: provider as any
      }
    });
  });

  afterAll(async () => {
    await hk.rpc.close();
  });

  it("should trigger a UTXO collision when planning concurrently", async () => {
    const alice = await hk.accounts.resolve("alice");
    const bob = await hk.accounts.resolve("bob");
    const address = alice.address;

    // We intercept the query method to simulate exactly 1 spendable UTXO
    hk.query.getSpendableUtxos = async () => {
      return {
        data: [
          {
            address: address.toString(),
            outpoint: { transactionId: "0000000000000000000000000000000000000000000000000000000000000001", index: 0 },
            amountSompi: "5000000000", // 50 KAS
            scriptPublicKey: "00"
          }
        ]
      } as any;
    };

    // We also need to mock getBlockDagInfo so it doesn't fail trying to connect to the missing RPC node
    hk.rpc.getBlockDagInfo = async () => ({ virtualDaaScore: "100", sink: "hash1" } as any);
    hk.rpc.getFeeEstimate = async () => ({ priorityBucket: { feePerMass: "1" }, normalBucket: { feePerMass: "1" }, lowBucket: { feePerMass: "1" } } as any);
    hk.rpc.getCurrentNetwork = async () => ({ networkId: "simnet" } as any);
    hk.rpc.connect = async () => {};
    hk.rpc.disconnect = async () => {};
    Object.defineProperty(hk.rpc, 'isConnected', { get: () => true });

    // Two independent planners hit the SDK at the exact same time
    const [intentA, intentB] = await Promise.all([
      hk.tx.plan({
        from: alice,
        amount: "10 KAS",
        to: bob
      }),
      hk.tx.plan({
        from: alice,
        amount: "15 KAS",
        to: bob
      })
    ]);

    console.log("Intent A:", JSON.stringify(intentA, null, 2));
    const inputsA = intentA.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    const inputsB = intentB.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);

    console.log(`[W2] Plan A selected outpoints:`, inputsA);
    console.log(`[W2] Plan B selected outpoints:`, inputsB);

    const collision = inputsA.some(a => inputsB.includes(a));
    console.log(`[W2] Collision occurred? ${collision}`);
    
    if (collision) {
      console.log(`[W2] BLOCKER IDENTIFIED: The planner is stateless and read-only. Concurrent requests successfully planned over the same authoritative UTXO state.`);
    }

    expect(collision).toBe(true);
  });
});
