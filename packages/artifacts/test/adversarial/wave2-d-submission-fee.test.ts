import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../../src/canonical.js";
import { verifyArtifactSemantics, verifyArtifactIntegritySync } from "../../src/verify.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { createSimulatedTxReceipt, deriveSimulatedFee, syntheticTxIdFor } from "../../src/signed-tx.js";
import {
  deriveSubmissionFee,
  parseSignedTransactionPayload,
  checkSubmissionFeeCoherence,
  checkSignedAgainstPlan,
  expectedScriptPublicKeyHex,
  decodeKaspaAddress
} from "../../src/submission-fee.js";

// Wave 2(d) · AUD-18 · T-A18 — the fee of a submission/receipt is DERIVED from what the
// transaction consumes and produces; when the evidence does not allow it, the record
// says `insufficient-evidence` (never an estimate copied from metadata, never "0").
// 2(d) security review: the derivation is only for THE transaction the plan authorized —
// a signed transaction that diverges from the plan is SIGNED_PLAN_MISMATCH, never "more fee".

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const OTHER = "kaspasim:qq56zz2ta0s9fmf67j6yw0w87urrtkpx03l4ddh3c2y5ex0jrt60yvcx9ypa6";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;

function makePlan(opts: { fee?: bigint; amount?: bigint } = {}): any {
  const amount = opts.amount ?? 600n;
  const fee = opts.fee ?? 25n;
  const plan: any = {
    inputs: [
      { outpoint: { transactionId: "a".repeat(64), index: 0 }, amountSompi: 1000n, address: FROM, scriptPublicKey: script(FROM) },
      { outpoint: { transactionId: "b".repeat(64), index: 3 }, amountSompi: 500n, address: FROM, scriptPublicKey: script(FROM) }
    ],
    outputs: [{ address: TO, amountSompi: amount }],
    change: { address: FROM, amountSompi: 1500n - amount - fee },
    estimatedFeeSompi: fee,
    estimatedMass: 100n
  };
  return createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: FROM, accountName: "alice" },
    to: { input: "bob", address: TO },
    amountSompi: amount,
    plan
  });
}

/** The RPC transaction a real signer serialises: inputs by outpoint, outputs with amount and script. */
function signedPayloadFor(plan: any, mutate?: (tx: any) => void): string {
  const tx: any = {
    version: 0,
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index }, signatureScript: "41aa", sequence: 0, sigOpCount: 1 })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ],
    lockTime: 0,
    subnetworkId: "00".repeat(20)
  };
  mutate?.(tx);
  return JSON.stringify(tx);
}

describe("Wave 2(d) · signed ↔ plan equivalence before any fee is derived", () => {
  it("Kaspa addresses decode to the standard scripts the plan denotes (P2PK schnorr)", () => {
    const d = decodeKaspaAddress(FROM)!;
    expect(d.prefix).toBe("kaspasim");
    expect(d.version).toBe(0);
    expect(d.payload.length).toBe(32);
    expect(script(FROM)).toMatch(/^20[0-9a-f]{64}ac$/);
    expect(script(FROM)).not.toBe(script(TO));
    expect(expectedScriptPublicKeyHex("kaspasim:qqalice")).toBeUndefined();
    expect(expectedScriptPublicKeyHex("not-an-address")).toBeUndefined();
  });

  it("1 · plan and signed economically identical ⇒ fee derived", () => {
    const plan = makePlan({ fee: 25n });
    const check = checkSignedAgainstPlan({ format: "hex", payload: signedPayloadFor(plan) }, plan);
    expect(check.ok).toBe(true);
    expect(deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan) }, plan })).toEqual({
      status: "derived",
      method: "inputs-minus-outputs",
      inputsSompi: "1500",
      outputsSompi: "1475",
      feeSompi: "25",
      inputCount: 2,
      outputCount: 2,
      planArtifactId: plan.contentHash
    });
  });

  it("2 · the signed change is 7 sompi smaller ⇒ SIGNED_PLAN_MISMATCH, never 'fee + 7'", () => {
    const plan = makePlan({ fee: 25n });
    const r = deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan, (tx) => { tx.outputs[1].amount = (BigInt(tx.outputs[1].amount) - 7n).toString(); }) }, plan });
    expect(r).toMatchObject({ status: "mismatch", code: "SIGNED_PLAN_MISMATCH" });
    expect((r as any).reason).toMatch(/change: the signed transaction pays 868 but the plan authorizes 875/);
    expect(JSON.stringify(r)).not.toMatch(/"feeSompi"/);
  });

  it("3 · the signed payment amount differs with the same inputs ⇒ SIGNED_PLAN_MISMATCH", () => {
    const plan = makePlan();
    const r = deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan, (tx) => { tx.outputs[0].amount = "601"; }) }, plan });
    expect(r).toMatchObject({ status: "mismatch", code: "SIGNED_PLAN_MISMATCH" });
    expect((r as any).reason).toMatch(/output\[0\]/);
  });

  it("4 · extra, omitted, reordered outputs or a different destination ⇒ SIGNED_PLAN_MISMATCH (exact order)", () => {
    const plan = makePlan();
    const cases: Array<[string, (tx: any) => void, RegExp]> = [
      ["extra output", (tx) => { tx.outputs.push({ amount: "1", scriptPublicKey: { version: 0, scriptPublicKey: script(OTHER) } }); }, /3 output\(s\) but the plan authorizes 2/],
      ["omitted change", (tx) => { tx.outputs.pop(); }, /1 output\(s\) but the plan authorizes 2/],
      ["reordered (change first)", (tx) => { tx.outputs.reverse(); }, /output\[0\]/],
      ["payment redirected", (tx) => { tx.outputs[0].scriptPublicKey.scriptPublicKey = script(OTHER); }, /destination script differs/],
      ["change redirected", (tx) => { tx.outputs[1].scriptPublicKey.scriptPublicKey = script(OTHER); }, /change: the signed destination script differs/],
      ["output without a script", (tx) => { delete tx.outputs[0].scriptPublicKey; }, /carries no destination script/],
      ["signed input not in plan", (tx) => { tx.inputs[0].previousOutpoint.transactionId = "c".repeat(64); }, /not among the plan's inputs/],
      ["plan input not spent", (tx) => { tx.inputs.pop(); }, /not spent by the signed transaction/],
      ["repeated input", (tx) => { tx.inputs[1] = tx.inputs[0]; }, /repeats an input outpoint/]
    ];
    for (const [label, mutate, reason] of cases) {
      const r = deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan, mutate) }, plan });
      expect(r.status, label).toBe("mismatch");
      expect((r as any).code, label).toBe("SIGNED_PLAN_MISMATCH");
      expect((r as any).reason, label).toMatch(reason);
    }
  });

  it("insufficient evidence — never 0 — when the payload is opaque or missing, or the plan is missing/unsealed", () => {
    const plan = makePlan();
    const cases: Array<[string, ReturnType<typeof deriveSubmissionFee>]> = [
      ["opaque hex", deriveSubmissionFee({ signedTransaction: { format: "hex", payload: "deadbeef" }, plan })],
      ["no payload", deriveSubmissionFee({ signedTransaction: { format: "hex" }, plan })],
      ["no plan", deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan) }, plan: undefined })],
      ["unsealed plan", deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan) }, plan: { ...plan, contentHash: undefined } })],
      ["no outputs", deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(plan, (tx) => { tx.outputs = []; }) }, plan })]
    ];
    for (const [label, fee] of cases) {
      expect(fee.status, label).toBe("insufficient-evidence");
      expect((fee as any).reason, label).toMatch(/\S/);
      expect(JSON.stringify(fee), label).not.toMatch(/"feeSompi"/);
    }
    // A genuine zero fee is a derivation of a plan that authorizes it (inputs = outputs + change), not a fallback.
    const zeroPlan = makePlan({ fee: 0n });
    expect(deriveSubmissionFee({ signedTransaction: { format: "hex", payload: signedPayloadFor(zeroPlan) }, plan: zeroPlan })).toMatchObject({ status: "derived", feeSompi: "0", inputsSompi: "1500", outputsSompi: "1500" });
  });

  it("parseSignedTransactionPayload reads flattened and wrapped RPC shapes and refuses non-transactions", () => {
    const plan = makePlan();
    expect(parseSignedTransactionPayload(signedPayloadFor(plan)).ok).toBe(true);
    expect(parseSignedTransactionPayload(JSON.stringify({ tx: { inner: JSON.parse(signedPayloadFor(plan)) } })).ok).toBe(true);
    expect(parseSignedTransactionPayload(JSON.stringify({ hello: "world" })).ok).toBe(false);
    expect(parseSignedTransactionPayload("not json").ok).toBe(false);
  });

  it("the verifier flags a recorded fee that is not what it claims (SUBMISSION_FEE_INCOHERENT); an insufficient-evidence record needs a reason", () => {
    expect(checkSubmissionFeeCoherence({ status: "derived", method: "inputs-minus-outputs", inputsSompi: "1500", outputsSompi: "1475", feeSompi: "30", inputCount: 2, outputCount: 2, planArtifactId: "a".repeat(64) }).ok).toBe(false);
    expect(checkSubmissionFeeCoherence({ status: "insufficient-evidence", reason: "" }).ok).toBe(false);
    expect(checkSubmissionFeeCoherence(undefined).ok).toBe(true);

    const plan = makePlan();
    const submission: any = {
      schema: "hardkas.txSubmission.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet",
      mode: "localnet",
      createdAt: "2026-09-26T00:00:00.000Z",
      signedArtifactId: "b".repeat(64),
      txId: "c".repeat(64),
      submitResult: { accepted: true, transactionId: "c".repeat(64) },
      fee: { status: "derived", method: "inputs-minus-outputs", inputsSompi: "1500", outputsSompi: "1475", feeSompi: "30", inputCount: 2, outputCount: 2, planArtifactId: plan.contentHash },
      workflowId: "wf_0000000000000000",
      assumptionLevel: "local-rpc",
      lineage: { artifactId: "", parentArtifactId: "b".repeat(64), lineageId: "b".repeat(64), rootArtifactId: "b".repeat(64), sequence: 3 }
    };
    submission.contentHash = calculateContentHash(submission, CURRENT_HASH_VERSION);
    submission.lineage.artifactId = submission.contentHash;
    expect(verifyArtifactIntegritySync(structuredClone(submission), { strict: true }).ok).toBe(true); // intact...
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2d-"));
    try {
      const semantics = verifyArtifactSemantics(structuredClone(submission), { strict: true, workspaceRoot: ws });
      expect(semantics.ok).toBe(false); // ...but its fee lies
      expect(codes(semantics)).toContain("SUBMISSION_FEE_INCOHERENT");
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  it("a simulated receipt's fee is derived from the plan it executes; an unbalanced plan cannot produce a receipt", () => {
    const plan = makePlan({ fee: 25n });
    expect(deriveSimulatedFee(plan)).toEqual({ ok: true, feeSompi: 25n });
    const receipt = createSimulatedTxReceipt(plan, syntheticTxIdFor(plan.contentHash), ctx, { preStateHash: "1".repeat(64), postStateHash: "2".repeat(64) });
    expect(receipt.feeSompi).toBe("25");

    const unbalanced: any = structuredClone(plan);
    unbalanced.estimatedFeeSompi = "40"; // declares a fee the execution would not charge
    expect(() => createSimulatedTxReceipt(unbalanced, syntheticTxIdFor(plan.contentHash), ctx)).toThrow(/RECEIPT_FEE_UNBALANCED|consumes − produces = 25/);

    const noInputs: any = { ...structuredClone(plan), inputs: [] };
    expect(() => createSimulatedTxReceipt(noInputs, syntheticTxIdFor(plan.contentHash), ctx)).toThrow(/RECEIPT_FEE_UNDERIVABLE|cannot be derived/);
    expect(JSON.stringify(receipt)).not.toMatch(/"feeSompi":"0"/);
  });
});
