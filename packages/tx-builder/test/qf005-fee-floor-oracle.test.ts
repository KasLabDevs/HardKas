import { describe, it, expect } from "vitest";
import {
  calculateConsensusNonContextualMass,
  KASPA_MASS_CONSTANTS
} from "../src/mass.js";
import { estimateFee } from "../src/fee-estimator.js";

/**
 * QF-005 Oracle Test Suite
 *
 * Pinned Docker Container: kaspanet/rusty-kaspad:v2.0.0
 * Pinned Image Digest: sha256:4381049628e1a9a74868eb208b60b9cb8545796156da65dd497e9019fbcb2201
 * Pinned Environment: RUSTY_VERSION=2026-06-08.895766fd
 */
describe("QF-005: Node Relay Fee Floor Oracle Suite", () => {
  it("QF-005-A1: Historical RC17 Compute-Dominated Rejection Fixture (2036 mass * 100 = 203600 sompi)", () => {
    // Frozen historical RC17 transaction shape:
    // 1 P2PK coinbase input (~66 byte Schnorr sig script)
    // 2 P2PK outputs (recipient + change)
    // Node rejection message: "transaction has 106000 fees which is under the required amount of 203600 for compute mass 2036"
    const computeDominatedTx = {
      inputCount: 1,
      outputs: [
        { address: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980" },
        { address: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn" }
      ],
      payloadBytes: 0,
      signatureScriptBytes: 66
    };

    const massResult = calculateConsensusNonContextualMass(computeDominatedTx);
    expect(massResult.computeMass).toBe(2036n);
    expect(massResult.feeMass).toBe(2036n);

    const feeResult = estimateFee({
      inputs: 1,
      outputs: 2,
      feeRateSompiPerMass: 100n,
      txDetails: computeDominatedTx
    });

    expect(feeResult.estimatedFeeSompi).toBe(203600n);
  });

  it("QF-005-A2: Transient/Byte-Dominated Fixture (normalizedTransientMass > computeMass)", () => {
    // Large payload or script-heavy transaction fixture where byte/transient mass dominates compute mass
    const transientDominatedTx = {
      inputCount: 1,
      outputs: [
        { address: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980" }
      ],
      payloadBytes: 5000, // 5KB payload pushes transient mass far above compute mass
      signatureScriptBytes: 66
    };

    const massResult = calculateConsensusNonContextualMass(transientDominatedTx);

    // transientMass = 5000 * PAYLOAD_BYTE_MASS
    expect(massResult.transientMass).toBeGreaterThan(massResult.computeMass);
    expect(massResult.feeMass).toBe(massResult.transientMass);

    const feeResult = estimateFee({
      inputs: 1,
      outputs: 1,
      feeRateSompiPerMass: 100n,
      txDetails: transientDominatedTx
    });

    // Relay floor must equal transientMass * 100
    expect(feeResult.estimatedFeeSompi).toBe(massResult.transientMass * 100n);
  });
});
