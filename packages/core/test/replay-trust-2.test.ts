import { describe, it, expect } from "vitest";
import { diffReplays } from "../src/replay.js";

// REPLAY-TRUST-2 (investigation, 2026-10-05, base 43d30e4f5) · BEFORE for `hardkas replay diff` (REPLAY-DIFF-SCOPE-1).
// `diffReplays` compares `artifacts.length`, `stateRoot || postStateHash` and `amountSompi`, plus timestamps as noise.
// A replay report (hardkas.replayReport.v1) has none of those fields, so two reports with opposite verdicts compare as
// "no deterministic divergence"; on receipts, every field but the post-state hash and the amount is ignored.

const report = (over: Record<string, unknown> = {}) => ({
  schema: "hardkas.replayReport.v1",
  version: "1.0.0-alpha",
  hashVersion: 5,
  networkId: "simulated",
  mode: "simulator",
  createdAt: "2026-10-05T10:00:00.000Z",
  txId: "synthetic-" + "aa".repeat(32),
  receiptComparison: "raw",
  planOk: true,
  receiptOk: true,
  invariantsOk: true,
  checks: { workflowDeterministic: "reproduced", consensusValidation: "unimplemented", l2BridgeCorrectness: "unimplemented" },
  divergences: [],
  errors: [],
  ...over
});
const receipt = (over: Record<string, unknown> = {}) => ({
  schema: "hardkas.txReceipt",
  createdAt: "2026-10-05T10:00:00.000Z",
  txId: "synthetic-" + "aa".repeat(32),
  status: "accepted",
  amountSompi: "700000000",
  feeSompi: "203600",
  spentUtxoIds: ["synthetic-" + "bb".repeat(32) + ":1"],
  createdUtxoIds: ["synthetic-" + "aa".repeat(32) + ":0"],
  postStateHash: "f2".repeat(32),
  ...over
});
const deterministic = (d: ReturnType<typeof diffReplays>) =>
  d.deterministic.stateRootDiverged ||
  d.deterministic.lineageDiverged ||
  d.deterministic.graphDiverged ||
  d.deterministic.differences.length > 0 ||
  d.structural.missingArtifacts.length > 0 ||
  d.structural.missingProjections.length > 0;

describe("REPLAY-TRUST-2 · BEFORE · replay diff (REPLAY-DIFF-SCOPE-1)", () => {
  it("control: the same report twice has no deterministic difference", () => {
    expect(deterministic(diffReplays(report(), report()))).toBe(false);
  });

  it("control: a time shift alone is observational noise", () => {
    const d = diffReplays(report(), report({ createdAt: "2026-10-05T10:00:05.000Z" }));
    expect(deterministic(d)).toBe(false);
    expect(d.observational.timestampShifts.length).toBe(1);
  });

  it("control: two receipts with different post-states differ", () => {
    expect(deterministic(diffReplays(receipt(), receipt({ postStateHash: "a0".repeat(32) })))).toBe(true);
  });

  it("a reproduced report and a diverged report of the same transaction differ", () => {
    const diverged = report({
      receiptOk: false,
      invariantsOk: false,
      checks: { workflowDeterministic: "diverged", consensusValidation: "unimplemented", l2BridgeCorrectness: "unimplemented" },
      divergences: [{ path: "receipt.amountSompi", expected: "700000001", actual: "700000000" }],
      errors: ['Receipt divergence at amountSompi: expected "700000001", got "700000000"']
    });
    const d = diffReplays(report(), diverged);
    expect(deterministic(d), JSON.stringify(d.deterministic)).toBe(true);
  });

  it("reports about two different transactions differ", () => {
    expect(deterministic(diffReplays(report(), report({ txId: "synthetic-" + "cc".repeat(32) })))).toBe(true);
  });

  it("two receipts that differ only in their status differ", () => {
    expect(deterministic(diffReplays(receipt(), receipt({ status: "failed" })))).toBe(true);
  });

  it("two receipts that differ only in the outpoints they created differ", () => {
    expect(deterministic(diffReplays(receipt(), receipt({ createdUtxoIds: ["synthetic-" + "dd".repeat(32) + ":0"] })))).toBe(true);
  });
});
