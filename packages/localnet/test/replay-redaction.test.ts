import { describe, it, expect } from "vitest";
import { systemRuntimeContext, parseKasToSompi, coreEvents } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { createInitialLocalnetState, applySimulatedPayment, verifyReplay } from "../src/index.js";

// EVIDENCE-DIFF-REDACTION-1 (investigation, 2026-10-04) · BEFORE at the replay boundary. Replay is the check that
// recomputes a receipt from its plan and pre-state; it decides "reproduced" from diffArtifacts(original, replayed),
// which compares masked values. A receipt re-sealed after a change (its contentHash recomputed, as any writer can) is
// consistent for every integrity check, so replay is where a changed recorded result must show.

const ctx = systemRuntimeContext;
/** the same 64-hex string with every one of its 54 middle characters changed: first 6 and last 4 kept */
const flipMiddle = (h: string) => h.slice(0, 6) + [...h.slice(6, 60)].map((c) => (c === "0" ? "1" : "0")).join("") + h.slice(60);
/** the same 64-hex string with only its first character changed */
const flipFirst = (h: string) => (h[0] === "0" ? "1" : "0") + h.slice(1);

function execute() {
  const initial: any = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("100") });
  const result = applySimulatedPayment(initial, { from: "alice", to: "bob", amountSompi: parseKasToSompi("10") }, ctx);
  if (!result.ok) throw new Error(result.errors.join(", "));
  return { initial, plan: result.planArtifact!, receipt: result.receipt as any };
}
/** a changed copy of the receipt, re-sealed the way the existing replay tests re-seal one */
function resealed(receipt: any, change: (r: any) => void) {
  const r = structuredClone(receipt);
  change(r);
  r.contentHash = calculateContentHash(r, CURRENT_HASH_VERSION);
  r.lineage.artifactId = r.contentHash;
  return r;
}

describe("EVIDENCE-DIFF-REDACTION-1 · replay decides on the recorded values", () => {
  it("control: the genuine receipt is reproduced", () => {
    const { initial, plan, receipt } = execute();
    const report = verifyReplay(initial, plan, receipt, ctx);
    expect(report.invariantsOk, report.errors.join(" | ")).toBe(true);
    expect(report.checks.workflowDeterministic).toBe("reproduced");
  });

  it("control: a postStateHash changed in its first character diverges", () => {
    const { initial, plan, receipt } = execute();
    const report = verifyReplay(initial, plan, resealed(receipt, (r) => (r.postStateHash = flipFirst(r.postStateHash))), ctx);
    expect(report.invariantsOk).toBe(false);
    expect(report.divergences.some((d: any) => d.path === "receipt.postStateHash")).toBe(true);
  });

  it("a postStateHash changed only in its middle diverges", () => {
    const { initial, plan, receipt } = execute();
    const changed = resealed(receipt, (r) => (r.postStateHash = flipMiddle(r.postStateHash)));
    expect(changed.postStateHash).not.toBe(receipt.postStateHash);
    const report = verifyReplay(initial, plan, changed, ctx);
    expect(report.invariantsOk, "the recorded post-state is not the one replay computes").toBe(false);
    expect(report.checks.workflowDeterministic).toBe("diverged");
    expect(report.divergences.some((d: any) => d.path === "receipt.postStateHash")).toBe(true);
  });

  it("(proposed contract) a divergence on a public hash records the real expected and actual values", () => {
    const { initial, plan, receipt } = execute();
    const changed = resealed(receipt, (r) => (r.postStateHash = flipFirst(r.postStateHash)));
    const report = verifyReplay(initial, plan, changed, ctx);
    const div = report.divergences.find((d: any) => d.path === "receipt.postStateHash");
    expect(div).toMatchObject({ expected: changed.postStateHash, actual: receipt.postStateHash });
    expect(JSON.stringify(report)).not.toContain("[REDACTED]");
  });

  it.each([
    ["spentUtxoIds", "receipt.spentUtxoIds[0]"],
    ["createdUtxoIds", "receipt.createdUtxoIds[0]"]
  ])("%s changed only in the middle of their ids diverge", (field, path) => {
    const { initial, plan, receipt } = execute();
    const changed = resealed(receipt, (r) => (r[field] = r[field].map((id: string) => id.replace(/[0-9a-f]{64}/, flipMiddle))));
    expect(changed[field]).not.toEqual(receipt[field]);
    const report = verifyReplay(initial, plan, changed, ctx);
    expect(report.invariantsOk).toBe(false);
    expect(report.checks.workflowDeterministic).toBe("diverged");
    expect(report.divergences.find((d: any) => d.path === path)).toMatchObject({ expected: changed[field][0], actual: receipt[field][0] });
  });

  it("a new report says its receipt was compared raw (reports without it are legacy)", () => {
    const { initial, plan, receipt } = execute();
    const report = verifyReplay(initial, plan, receipt, ctx);
    expect(report.receiptComparison).toBe("raw");
  });

  it("a divergence in a nested secret field is recorded as 'differs' only: report, errors and events hold no value", () => {
    const { initial, plan, receipt } = execute();
    const SECRET = "tok-7f3c9a1e5b";
    const changed = resealed(receipt, (r) => (r.execution = { ...r.execution, token: SECRET }));
    const events: any[] = [];
    const off = coreEvents.on((e: any) => events.push(e));
    let report: any;
    try {
      report = verifyReplay(initial, plan, changed, ctx);
    } finally {
      off();
    }
    expect(report.invariantsOk).toBe(false);
    expect(report.divergences).toContainEqual({ path: "receipt.execution.token", status: "differs" });
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    // replay.divergence events reach a listener only when they pass envelope validation (today they do not, so none
    // does); whatever is emitted must say "differs", never carry the value
    for (const e of events.filter((x) => JSON.stringify(x).includes("receipt.execution.token"))) expect(JSON.stringify(e)).toContain("differs");
  });

  it("a divergence on a value that holds a secret records no part of it", () => {
    const { initial, plan, receipt } = execute();
    const SECRET = "k-4d2b8e6f0a";
    const changed = resealed(receipt, (r) => (r.metadata = { note: "public", auth: { apiKey: SECRET } }));
    const report = verifyReplay(initial, plan, changed, ctx);
    expect(report.invariantsOk).toBe(false);
    expect(report.divergences).toContainEqual({ path: "receipt.metadata", status: "differs" });
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it("(observation) a txId changed in its first character: does replay notice?", () => {
    const { initial, plan, receipt } = execute();
    const changed = resealed(receipt, (r) => (r.txId = r.txId.replace(/[0-9a-f]{64}$/, (h: string) => flipFirst(h))));
    expect(changed.txId).not.toBe(receipt.txId);
    const report = verifyReplay(initial, plan, changed, ctx);
    expect(report.invariantsOk, "replay should not reproduce a receipt whose txId is not the plan's").toBe(false);
  });
});
