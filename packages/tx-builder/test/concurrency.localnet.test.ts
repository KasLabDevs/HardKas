import { describe, test, expect, beforeAll, afterAll } from "vitest";
// @ts-ignore
import { Hardkas } from "@hardkas/sdk";

// This test suite runs against a real localnet and asserts the optimistic concurrency model.
// The level's global setup funds alice (packages/dev-server/test/global-setup.ts): a plan that finds no funds is a
// failed precondition and fails the test; it is never skipped (a skipped W1–W3 would pass the level by omission).
describe("Optimistic Concurrency & Integrity Semantics", () => {
  let hk: any;
  let alice: any;
  let bob: any;

  beforeAll(async () => {
    // REMED-CLOSE: the level's own workspace (its global setup creates it), never the repository root's .hardkas
    const workspace = process.env.HARDKAS_TEST_LOCALNET_WORKSPACE;
    if (!workspace) {
      throw new Error("LOCALNET_WORKSPACE_MISSING: run this file through vitest.localnet.config.ts, whose global setup creates the level's own workspace");
    }
    hk = await Hardkas.create({
      cwd: workspace,
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

  test("W1: Sequential sends succeed without reusing pending input", async () => {
    const intentA = await hk.tx.plan({ from: alice, amount: "1 KAS", to: bob });
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

  test("W2: Concurrent read-only plans may overlap and do not mutate state", async () => {
    const fundIntent = await hk.tx.plan({ from: alice, amount: "5 KAS", to: bob });
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

  test("W3: Two genuinely conflicting signed submissions maintain receipt integrity", async () => {
    const fundIntent = await hk.tx.plan({ from: alice, amount: "5 KAS", to: bob });
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

    // Both spend the same first input (one state, one canonical order): they genuinely conflict
    expect(intentA.inputs[0].outpoint).toEqual(intentB.inputs[0].outpoint);

    // 3. Submit concurrently. sdk.tx.send records every outcome and RETURNS it — it does not throw on a node rejection:
    //    `submitted` is the node's answer and the recorded submission keeps it. (This test predates that contract, and the
    //    level never ran it: it counted every fulfilled send as accepted and looked for txReceipt-<txId>.json files.)
    const results = await Promise.allSettled([
      hk.tx.send(signedA),
      hk.tx.send(signedB)
    ]);
    const outcomes = results.map((r) =>
      r.status === "rejected" ? "refused-before-sending" : (r.value as any).submitted === true ? "accepted" : "rejected-by-node"
    );

    // Exactly one should win, one should fail
    expect(outcomes.filter((o) => o === "accepted"), JSON.stringify(outcomes)).toHaveLength(1);
    expect(outcomes.filter((o) => o !== "accepted"), JSON.stringify(outcomes)).toHaveLength(1);

    // 4. Receipt integrity: the winner's recorded submission says accepted and exists on disk; the loser never has a
    //    record claiming acceptance (the node's rejection is recorded as such, or nothing was sent)
    const fs = await import("fs");
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const v: any = r.value;
      expect(v.submission.submitResult.accepted, JSON.stringify(v.submission.submitResult)).toBe(v.submitted === true);
      if (v.submitted === true) expect(fs.existsSync(v.receiptPath)).toBe(true);
      else expect(String(v.submission.submitResult.error ?? "")).not.toBe("");
    }
  });
});
