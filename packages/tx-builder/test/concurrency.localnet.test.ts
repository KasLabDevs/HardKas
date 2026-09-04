import { describe, test, expect, beforeAll, afterAll } from "vitest";
// @ts-ignore
import { Hardkas } from "@hardkas/sdk";

// This test suite runs against a real localnet and asserts the optimistic concurrency model
describe("Optimistic Concurrency & Integrity Semantics", () => {
  let hk: any;
  let alice: any;
  let bob: any;

  beforeAll(async () => {
    hk = await Hardkas.create({
      network: "simnet",
      autoBootstrap: true,
      policy: { allowPublic: true },
      rpc: { url: "ws://127.0.0.1:18210" }
    } as any);

    try {
      alice = await hk.accounts.resolve("alice");
      bob = await hk.accounts.resolve("bob");
    } catch (e) {
      console.warn("Could not resolve dev accounts. Check autoBootstrap/network configs.");
      throw e;
    }
  });

  afterAll(async () => {
    if (hk) {
      await hk.rpc.close();
    }
  });

  test("W1: Sequential sends succeed without reusing pending input", async (ctx) => {
    let intentA;
    try {
      intentA = await hk.tx.plan({ from: alice, amount: "1 KAS", to: bob });
    } catch (e: any) {
      if (e.message?.includes("Insufficient funds")) return ctx.skip();
      throw e;
    }
    const signedA = await hk.tx.sign(intentA, alice);
    const resultA = await hk.tx.send(signedA);
    expect(resultA.txId).toBeDefined();

    // 2. Plan, sign and send B
    const intentB = await hk.tx.plan({ from: alice, amount: "1 KAS", to: bob });
    const signedB = await hk.tx.sign(intentB, alice);
    const resultB = await hk.tx.send(signedB);
    expect(resultB.txId).toBeDefined();

    // Outpoints should be distinct because mempool-aware spendability filtered the pending one
    const outpointsA = intentA.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    const outpointsB = intentB.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    // @ts-ignore
    expect(outpointsA.join(",")).not.toBe(outpointsB.join(","));
  });

  test("W2: Concurrent read-only plans may overlap and do not mutate state", async (ctx) => {
    let fundIntent;
    try {
      fundIntent = await hk.tx.plan({ from: alice, amount: "5 KAS", to: bob });
    } catch (e: any) {
      if (e.message?.includes("Insufficient funds")) return ctx.skip();
      throw e;
    }
    const fundSigned = await hk.tx.sign(fundIntent, alice);
    await hk.tx.send(fundSigned);
    
    // Wait for maturity
    await new Promise(r => setTimeout(r, 5000));

    // 2. Plan concurrently
    const [intentA, intentB] = await Promise.all([
      hk.tx.plan({ from: bob, amount: "2 KAS", to: alice }),
      hk.tx.plan({ from: bob, amount: "2 KAS", to: alice })
    ]);

    const outpointsA = intentA.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    const outpointsB = intentB.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    
    // As per optimistic model contract, concurrent read-only queries observe the same state
    expect(outpointsA.join(",")).toBe(outpointsB.join(","));
  });

  test("W3: Two genuinely conflicting signed submissions maintain receipt integrity", async (ctx) => {
    let fundIntent;
    try {
      fundIntent = await hk.tx.plan({ from: alice, amount: "5 KAS", to: bob });
    } catch (e: any) {
      if (e.message?.includes("Insufficient funds")) return ctx.skip();
      throw e;
    }
    const fundSigned = await hk.tx.sign(fundIntent, alice);
    await hk.tx.send(fundSigned);
    
    await new Promise(r => setTimeout(r, 5000));

    // 2. Plan and sign conflicting intents
    const [intentA, intentB] = await Promise.all([
      hk.tx.plan({ from: bob, amount: "2 KAS", to: alice }),
      hk.tx.plan({ from: bob, amount: "3 KAS", to: alice })
    ]);
    const [signedA, signedB] = await Promise.all([
      hk.tx.sign(intentA, bob),
      hk.tx.sign(intentB, bob)
    ]);

    // 3. Submit concurrently
    const results = await Promise.allSettled([
      hk.tx.send(signedA),
      hk.tx.send(signedB)
    ]);

    let accepted = 0;
    let rejected = 0;
    let winnerTxId = null;
    let loserTxId = null;

    for (const [index, r] of results.entries()) {
      if (r.status === "fulfilled") {
        accepted++;
        winnerTxId = (r.value as any).txId;
      } else {
        rejected++;
        loserTxId = index === 0 ? signedA.txId : signedB.txId;
      }
    }

    // Exactly one should win, one should fail
    expect(accepted).toBe(1);
    expect(rejected).toBe(1);

    // 4. Verify artifact integrity (No false receipt for the loser)
    const fs = await import("fs");
    const path = await import("path");
    
    // In SDK tests, workspace directory is usually where the artifacts live
    const artifactsDir = hk.workspace.artifactsDir;
    
    const winnerReceiptPath = path.join(artifactsDir, "receipts", `txReceipt-${winnerTxId}.json`);
    const loserReceiptPath = path.join(artifactsDir, "receipts", `txReceipt-${loserTxId}.json`);

    const winnerHasReceipt = fs.existsSync(winnerReceiptPath);
    const loserHasReceipt = fs.existsSync(loserReceiptPath);

    expect(winnerHasReceipt).toBe(true);
    expect(loserHasReceipt).toBe(false);
  });
});
