import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import { MockRpcProvider } from "./mock-rpc";

describe("W2 - Concurrent Planner Collision (Read Only)", () => {
  let hk: Hardkas;
  let provider: MockRpcProvider;

  beforeAll(async () => {
    provider = new MockRpcProvider();
    hk = await Hardkas.create({
      network: "simnet",
      autoBootstrap: true,
      rpc: {
        provider: provider as any
      }
    });
  });

  afterAll(async () => {
    await hk.stop();
  });

  it("should trigger a UTXO collision when planning concurrently", async () => {
    const wallet = await hk.accounts.createWallet();
    const address = await wallet.deriveReceiveAddress();

    // Mock the UTXO
    provider.setUtxos(address.toString(), [
      {
        address: address.toString(),
        outpoint: { transactionId: "0000000000000000000000000000000000000000000000000000000000000001", index: 0 },
        amountSompi: "5000000000", // 50 KAS
        scriptPublicKey: { scriptPublicKey: "00" }
      }
    ]);

    // Two independent planners hit the SDK at the exact same time
    const [intentA, intentB] = await Promise.all([
      hk.tx.plan({
        account: wallet,
        amount: "100",
        destination: "simnet:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e"
      }),
      hk.tx.plan({
        account: wallet,
        amount: "150",
        destination: "simnet:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e"
      })
    ]);

    const inputsA = intentA.transaction.inputs.map(i => `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`);
    const inputsB = intentB.transaction.inputs.map(i => `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`);

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
