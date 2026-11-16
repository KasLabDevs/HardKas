import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, finalizeTxPlanIdentity } from "../src/tx-plan.js";
import { checkSignedAgainstPlan, deriveSubmissionFee, expectedScriptPublicKeyHex } from "../src/submission-fee.js";
import { validateArtifactSchema } from "../src/verify.js";
import { checkArtifactIdentity } from "../src/index.js";

// -----------------------------------------------------------------------------
// CLTV · a plan authorizes exactly the lock time it states. Absent = 0: every plan made before CLTV is checked exactly
// as before (lock time 0 only; RC1 · D7). A signed payload carrying a lock time its plan does not authorize stays
// SIGNED_PLAN_MISMATCH (never priced, never sent); one carrying the plan's lock time is the plan's transaction.
// -----------------------------------------------------------------------------

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;

function makePlan(lockTime?: unknown): any {
  const plan: any = createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: FROM, accountName: "alice" },
    to: { input: "bob", address: TO },
    amountSompi: 600n,
    plan: {
      inputs: [{ outpoint: { transactionId: "a".repeat(64), index: 0 }, amountSompi: 1000n, address: FROM, scriptPublicKey: script(FROM) }],
      outputs: [{ address: TO, amountSompi: 600n }],
      change: { address: FROM, amountSompi: 375n },
      estimatedFeeSompi: 25n,
      estimatedMass: 100n
    } as any
  });
  if (lockTime !== undefined) {
    plan.lockTime = lockTime;
    finalizeTxPlanIdentity(plan);
  }
  return plan;
}

function payload(plan: any, lockTime: unknown): { format: string; payload: string } {
  const tx: any = {
    version: 0,
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index }, signatureScript: "41aa", sequence: 0, sigOpCount: 1 })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      { amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }
    ],
    ...(lockTime !== undefined ? { lockTime } : {}),
    subnetworkId: "00".repeat(20)
  };
  return { format: "hex", payload: JSON.stringify(tx) };
}

describe("CLTV · checkSignedAgainstPlan / deriveSubmissionFee and the plan's lock time", () => {
  it("a plan with no lock time (every existing plan): lock time 0 or absent passes, anything else is SIGNED_PLAN_MISMATCH, as before", () => {
    const plan = makePlan();
    expect(plan.lockTime).toBeUndefined();
    for (const lt of [undefined, 0, "0"]) expect(checkSignedAgainstPlan(payload(plan, lt), plan), String(lt)).toMatchObject({ ok: true });
    for (const lt of [5, "5", "1700000000000", "x"]) {
      const r = checkSignedAgainstPlan(payload(plan, lt), plan);
      expect(r, String(lt)).toMatchObject({ ok: false, kind: "mismatch", code: "SIGNED_PLAN_MISMATCH" });
      expect((r as any).reason, String(lt)).toMatch(/authorizes lock time 0/);
    }
    expect(deriveSubmissionFee({ signedTransaction: payload(plan, 0), plan })).toMatchObject({ status: "derived", feeSompi: "25" });
  });

  it("a plan with a typed lock time: exactly that lock time passes and is priced; 0, absent or another one is SIGNED_PLAN_MISMATCH", () => {
    const plan = makePlan({ daaScore: "123456", observedAt: { virtualDaaScore: "1000" } });
    expect(checkSignedAgainstPlan(payload(plan, "123456"), plan)).toMatchObject({ ok: true });
    expect(checkSignedAgainstPlan(payload(plan, 123456), plan)).toMatchObject({ ok: true });
    expect(deriveSubmissionFee({ signedTransaction: payload(plan, "123456"), plan })).toMatchObject({ status: "derived", feeSompi: "25" });
    for (const lt of [undefined, 0, "123455", "123457", "1700000000000"]) {
      const r = checkSignedAgainstPlan(payload(plan, lt), plan);
      expect(r, String(lt)).toMatchObject({ ok: false, kind: "mismatch", code: "SIGNED_PLAN_MISMATCH" });
      expect((r as any).reason).toMatch(/authorizes lock time 123456/);
    }
    expect(deriveSubmissionFee({ signedTransaction: payload(plan, "1"), plan })).toMatchObject({ status: "mismatch", code: "SIGNED_PLAN_MISMATCH" });
  });

  it("a time lock is compared the same way", () => {
    const plan = makePlan({ timestampMs: "1767225600000" });
    expect(checkSignedAgainstPlan(payload(plan, "1767225600000"), plan)).toMatchObject({ ok: true });
    expect(checkSignedAgainstPlan(payload(plan, "1767225600001"), plan)).toMatchObject({ ok: false, code: "SIGNED_PLAN_MISMATCH" });
  });

  it("a plan whose lock time is not a valid typed value authorizes nothing (SIGNED_PLAN_MISMATCH, never guessed)", () => {
    for (const lockTime of [5, { daaScore: "600000000000" }, { timestampMs: "5" }, { daaScore: "5", extra: 1 }]) {
      const plan = makePlan(lockTime);
      const r = checkSignedAgainstPlan(payload(plan, typeof lockTime === "number" ? lockTime : 5), plan);
      expect(r, JSON.stringify(lockTime)).toMatchObject({ ok: false, code: "SIGNED_PLAN_MISMATCH" });
      expect((r as any).reason).toMatch(/lock time is not valid/);
    }
  });

  it("the plan's lockTime is inside its identity and its schema (TxPlanSchema.lockTime); a malformed one is schema-invalid", () => {
    const plan = makePlan({ daaScore: "123456", observedAt: { virtualDaaScore: "1000", pastMedianTimeMs: "1700000000000" } });
    expect(checkArtifactIdentity(plan)).toMatchObject({ ok: true });
    const tampered = { ...plan, lockTime: { daaScore: "123457", observedAt: plan.lockTime.observedAt } };
    expect(checkArtifactIdentity(tampered).ok).toBe(false);
    expect(validateArtifactSchema(plan).status).toBe("VALID");
    expect(validateArtifactSchema(makePlan()).status).toBe("VALID");
    expect(validateArtifactSchema({ ...makePlan(), lockTime: 5 }).status).toBe("INVALID");
    expect(validateArtifactSchema({ ...makePlan(), lockTime: { daaScore: "5", timestampMs: "500000000000" } }).status).toBe("INVALID");
  });
});
