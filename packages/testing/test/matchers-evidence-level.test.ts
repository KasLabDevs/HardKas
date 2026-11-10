// SC-04 · the covenant matchers never report as verified what no node checked.
//
// Below CONSENSUS_SIMNET a transition result is the testbed's own work: SYNTHETIC is structural only, SCRIPT_VM runs the
// UNVERIFIED SilverScript runner on a scenario transaction (not the signed one), and the successor UTXOs are ledger writes
// with the covenantId copied from the spent UTXO. The matchers used to pass on those by default (toPassCovenantTransition
// from SCRIPT_VM up; toPreserveCovenantId / toProduceSuccessor at any level, true by construction). They now fail with an
// explicit "NOT VERIFIED" unless the caller lowers the level on purpose.
import { describe, expect, it } from "vitest";
import { hardKasMatchers as m } from "../src/matchers.js";
import type { CovenantEvidenceLevel, CovenantTransitionResult } from "../src/covenant-testbed.js";

const COV = "ab".repeat(32);

function resultAt(level: CovenantEvidenceLevel, overrides: Partial<CovenantTransitionResult> = {}): CovenantTransitionResult {
  return {
    passed: true,
    evidenceLevel: level,
    status: level === "SYNTHETIC" ? "SYNTHETIC_PASS" : level === "SCRIPT_VM" ? "SCRIPT_VM_PASS" : "CONSENSUS_SIMNET_PASS",
    structuralPassed: true,
    covenantId: COV,
    previousStates: [],
    successorUtxos: [
      {
        outpoint: { transactionId: "cd".repeat(32), index: 0 },
        address: "kaspasim:placeholder",
        amountSompi: 1_000n,
        scriptPublicKey: "0000aa20" + "11".repeat(32) + "87",
        covenantId: COV,
        blockDaaScore: 1n,
        isCoinbase: false
      }
    ],
    ...overrides
  } as unknown as CovenantTransitionResult;
}

describe("SC-04 · covenant matchers and evidence levels", () => {
  it("toPassCovenantTransition() requires CONSENSUS_SIMNET by default and says NOT VERIFIED below it", () => {
    for (const level of ["SYNTHETIC", "SCRIPT_VM"] as const) {
      const r = m.toPassCovenantTransition(resultAt(level));
      expect(r.pass).toBe(false);
      expect(r.message()).toMatch(/^NOT VERIFIED: /);
      expect(r.message()).toContain(`evidenceLevel="${level}"`);
      expect(r.message()).toContain('below required "CONSENSUS_SIMNET"');
    }
    expect(m.toPassCovenantTransition(resultAt("SCRIPT_VM")).message()).toMatch(/UNVERIFIED SilverScript runner on a scenario transaction/);
    expect(m.toPassCovenantTransition(resultAt("CONSENSUS_SIMNET")).pass).toBe(true);
  });

  it("a lower level is accepted only when the caller asks for it", () => {
    expect(m.toPassCovenantTransition(resultAt("SCRIPT_VM"), { minEvidence: "SCRIPT_VM" }).pass).toBe(true);
    expect(m.toPassCovenantTransition(resultAt("SYNTHETIC"), { allowSyntheticOnly: true }).pass).toBe(true);
    expect(m.toPassCovenantTransition(resultAt("SYNTHETIC"), { minEvidence: "SCRIPT_VM" }).pass).toBe(false);
    // a failed transition is never a pass, whatever the level accepted
    expect(m.toPassCovenantTransition(resultAt("CONSENSUS_SIMNET", { passed: false, status: "CONSENSUS_SIMNET_FAIL" } as any)).pass).toBe(false);
  });

  it("toPreserveCovenantId / toProduceSuccessor refuse the testbed's own successor writes as NOT VERIFIED", () => {
    for (const level of ["SYNTHETIC", "SCRIPT_VM"] as const) {
      const preserve = m.toPreserveCovenantId(resultAt(level), COV);
      expect(preserve.pass).toBe(false);
      expect(preserve.message()).toMatch(/^NOT VERIFIED: covenantId preservation/);
      const succ = m.toProduceSuccessor(resultAt(level), 1);
      expect(succ.pass).toBe(false);
      expect(succ.message()).toMatch(/^NOT VERIFIED: successor outputs/);
    }
    expect(m.toPreserveCovenantId(resultAt("CONSENSUS_SIMNET"), COV).pass).toBe(true);
    expect(m.toProduceSuccessor(resultAt("CONSENSUS_SIMNET"), 1).pass).toBe(true);
  });

  it("the explicit lower level still checks the values (no tautology at the accepted level)", () => {
    expect(m.toPreserveCovenantId(resultAt("SCRIPT_VM"), COV, { minEvidence: "SCRIPT_VM" }).pass).toBe(true);
    expect(m.toPreserveCovenantId(resultAt("SCRIPT_VM"), "ef".repeat(32), { minEvidence: "SCRIPT_VM" }).pass).toBe(false);
    expect(m.toProduceSuccessor(resultAt("SCRIPT_VM"), 2, { minEvidence: "SCRIPT_VM" }).pass).toBe(false);
    // at CONSENSUS_SIMNET a wrong id or count still fails, with the ordinary message
    const wrong = m.toPreserveCovenantId(resultAt("CONSENSUS_SIMNET"), "ef".repeat(32));
    expect(wrong.pass).toBe(false);
    expect(wrong.message()).toMatch(/^Expected transition to preserve covenantId/);
  });

  it("a result with no evidence level is never verified", () => {
    const r = resultAt("CONSENSUS_SIMNET", { evidenceLevel: undefined } as any);
    expect(m.toPassCovenantTransition(r).pass).toBe(false);
    expect(m.toPreserveCovenantId(r, COV).pass).toBe(false);
    expect(m.toProduceSuccessor(r, 1).pass).toBe(false);
  });
});
