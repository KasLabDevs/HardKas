import { describe, it, expect } from "vitest";
import { systemRuntimeContext, parseKasToSompi, coreEvents, createEventEnvelope, validateEventEnvelope } from "@hardkas/core";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  verifyArtifactIntegrity,
  verifyArtifactSemantics,
  createSimulatedSignedTxArtifact
} from "@hardkas/artifacts";
import { createInitialLocalnetState, applySimulatedPayment, applySimulatedPlan, verifyReplay } from "../src/index.js";

// REPLAY-TRUST-2 (investigation, 2026-10-05, base 43d30e4f5) · BEFORE at the replay boundary (`verifyReplay`). Replay
// recomputes a receipt from its plan and pre-state and decides "reproduced" from the comparison of the two receipts.
// A receipt re-sealed after a change (its contentHash recomputed, as any writer can) passes every integrity check, so
// replay is where a changed recorded result must show. Each assertion is about what replay decides and records, never
// about how a fix would do it. The defects:
// - REPLAY-DIFF-SCOPE-1 · the comparison drops the frozen legacy SEMANTIC_EXCLUSIONS by name at any depth (`status`,
//   `dagContext`…), and replay re-uses the receipt's own txId instead of the one the plan derives;
// - REPLAY-DIVERGENCE-EVENT-1 · `replay.divergence` / `replay.verified` are handed to the bus as raw objects, which it
//   drops (only envelopes are emitted);
// - §4b · the report carries no lineage (nor workflowId / assumptionLevel): it does not say which receipt it verified,
//   and the strict verification `hardkas verify` applies rejects every report.

const ctx = systemRuntimeContext;

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
function eventsDuring(fn: () => void): any[] {
  const seen: any[] = [];
  const off = coreEvents.on((e: any) => seen.push(e));
  try {
    fn();
  } finally {
    off();
  }
  return seen;
}

describe("REPLAY-TRUST-2 · BEFORE · verifyReplay", () => {
  describe("controls", () => {
    it("the genuine receipt is reproduced", () => {
      const { initial, plan, receipt } = execute();
      const report = verifyReplay(initial, plan, receipt, ctx);
      expect(report.invariantsOk, report.errors.join(" | ")).toBe(true);
      expect(report.checks.workflowDeterministic).toBe("reproduced");
    });

    it("a re-sealed receipt with another amount diverges", () => {
      const { initial, plan, receipt } = execute();
      const report = verifyReplay(initial, plan, resealed(receipt, (r) => (r.amountSompi = String(BigInt(r.amountSompi) + 1n))), ctx);
      expect(report.invariantsOk).toBe(false);
      expect(report.divergences.some((d: any) => d.path === "receipt.amountSompi")).toBe(true);
    });

    it("a re-sealed receipt whose txId alone was changed diverges (its created outpoints no longer match)", () => {
      const { initial, plan, receipt } = execute();
      const changed = resealed(receipt, (r) => (r.txId = "synthetic-" + "cd".repeat(32)));
      const report = verifyReplay(initial, plan, changed, ctx);
      expect(report.invariantsOk).toBe(false);
    });

    it("the bus delivers a well-formed envelope to a listener", () => {
      const envelope = createEventEnvelope({
        kind: "replay.verified",
        domain: "replay" as any,
        workflowId: "wf-control" as any,
        correlationId: "corr-control" as any,
        networkId: "simulated" as any,
        payload: { txId: "tx-control", lineageId: "lineage-control" } as any,
        sequenceNumber: 0 as any,
        sourceSubsystem: "replay-trust-2-test"
      });
      const seen = eventsDuring(() => coreEvents.normalizeAndEmit(envelope));
      expect(validateEventEnvelope(envelope)).toBe(true);
      expect(seen.map((e) => e.kind)).toEqual(["replay.verified"]);
    });
  });

  describe("REPLAY-DIVERGENCE-EVENT-1 · the replay's outcome reaches the event bus", () => {
    it("a diverged replay emits a replay.divergence envelope for the field that diverged", () => {
      const { initial, plan, receipt } = execute();
      const changed = resealed(receipt, (r) => (r.amountSompi = String(BigInt(r.amountSompi) + 1n)));
      const seen = eventsDuring(() => verifyReplay(initial, plan, changed, ctx));
      const divergence = seen.filter((e) => e.kind === "replay.divergence" && validateEventEnvelope(e));
      expect(divergence.length, `kinds on the bus: ${JSON.stringify(seen.map((e) => e.kind))}`).toBeGreaterThan(0);
      expect(JSON.stringify(divergence)).toContain("amountSompi");
    });

    it("a reproduced replay emits replay.verified", () => {
      const { initial, plan, receipt } = execute();
      const seen = eventsDuring(() => verifyReplay(initial, plan, receipt, ctx));
      expect(seen.filter((e) => e.kind === "replay.verified" && validateEventEnvelope(e)).length, JSON.stringify(seen.map((e) => e.kind))).toBe(1);
    });
  });

  describe("REPLAY-DIFF-SCOPE-1 · nothing a receipt asserts escapes the comparison", () => {
    it("a re-sealed receipt that says the transaction failed is not reproduced by a successful execution", () => {
      const { initial, plan, receipt } = execute();
      const changed = resealed(receipt, (r) => (r.status = "failed"));
      expect(changed.status).not.toBe(receipt.status);
      const report = verifyReplay(initial, plan, changed, ctx);
      expect(report.invariantsOk, "the recorded status is not the one the replay produces").toBe(false);
    });

    it("a re-sealed receipt with another DAG context is not reproduced", () => {
      const { initial, plan, receipt } = execute();
      const changed = resealed(receipt, (r) => (r.dagContext = { ...r.dagContext, sink: "forged-sink" }));
      const report = verifyReplay(initial, plan, changed, ctx);
      expect(report.invariantsOk, "the recorded DAG context is not the one the replay produces").toBe(false);
    });

    it("a receipt naming another txId, with outpoints and post-state consistent with it, is not reproduced", () => {
      const { initial, plan, receipt } = execute();
      // what the simulator itself produces for this plan under another id: the forgery is consistent everywhere
      const sim = applySimulatedPlan(initial, plan, ctx, { txId: "synthetic-" + "ab".repeat(32) });
      const forged = resealed(receipt, (r) => {
        r.txId = sim.receipt.txId;
        r.createdUtxoIds = sim.receipt.createdUtxoIds;
        r.postStateHash = sim.receipt.postStateHash;
      });
      expect(forged.txId).not.toBe(receipt.txId);
      const report = verifyReplay(initial, plan, forged, ctx);
      expect(report.invariantsOk, "the plan derives the txId; a receipt naming another one is not this plan's execution").toBe(false);
    });
  });

  describe("§4b · the report is evidence about the receipt it verified", () => {
    it("the report names the receipt it verified as its lineage parent", () => {
      const { initial, plan, receipt } = execute();
      const report: any = verifyReplay(initial, plan, receipt, ctx);
      expect(report.lineage?.parentArtifactId, `report keys: ${Object.keys(report).join(", ")}`).toBe(receipt.contentHash);
    });

    it("control: the report passes integrity (its identity verifies)", async () => {
      const { initial, plan, receipt } = execute();
      const report = verifyReplay(initial, plan, receipt, ctx);
      const v = await verifyArtifactIntegrity(report);
      expect(v.ok, v.issues.filter((i: any) => i.severity === "error").map((i: any) => i.code).join(", ")).toBe(true);
    });

    it("the report passes the strict semantics `hardkas verify` applies (its chain resolvable, as in a store)", () => {
      const { initial, plan } = execute();
      // the chain the CLI produces (plan → signed → receipt): strict verification walks the parent's own ancestry, and
      // the in-memory plan → receipt shortcut of applySimulatedPayment is not a transition the strict rules accept
      const signed: any = createSimulatedSignedTxArtifact(plan as any, (plan as any).from.address, ctx);
      const receipt: any = applySimulatedPlan(initial, plan, ctx, { receiptExtra: { parentArtifact: signed } }).receipt;
      const report = verifyReplay(initial, plan, receipt, ctx);
      expect(report.invariantsOk, "precondition: the receipt of the real chain replays").toBe(true);
      // what the CLI runs after integrity (artifact-verify-runner: verifyArtifactSemantics with strict: true)
      const chain = [receipt, signed, plan];
      const v = verifyArtifactSemantics(report, {
        strict: true,
        parent: receipt,
        resolveArtifact: (id: string) => chain.find((a: any) => a.contentHash === id) ?? null
      });
      expect(v.ok, v.issues.filter((i: any) => i.severity === "error" || i.severity === "critical").map((i: any) => i.code).join(", ")).toBe(true);
    });
  });
});
