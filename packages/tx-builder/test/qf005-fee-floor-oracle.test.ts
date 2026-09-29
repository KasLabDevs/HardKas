import { describe, it, expect } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { calculateConsensusNonContextualMass, estimateTransactionMass } from "../src/mass.js";
import { planWithGenerator } from "../src/generator-plan.js";

/**
 * QF-005 Oracle Test Suite
 *
 * The A1 fixture was captured against:
 *   Pinned Docker Container: kaspanet/rusty-kaspad:v2.0.0
 *   Pinned Image Digest: sha256:4381049628e1a9a74868eb208b60b9cb8545796156da65dd497e9019fbcb2201
 *   Pinned Environment: RUSTY_VERSION=2026-06-08.895766fd
 *
 * Mass now comes from the pinned SDK, so the node's own number is the expected
 * value (HardKAS's former formula gave 2052 here).
 */
describe("QF-005: Node Relay Fee Floor Oracle Suite", () => {
  it("QF-005-A1: Historical RC17 Compute-Dominated Rejection Fixture (2036 mass * 100 = 203600 sompi)", async () => {
    // Frozen historical RC17 transaction shape:
    // 1 P2PK coinbase input (~66 byte Schnorr sig script)
    // 2 P2PK outputs (recipient + change)
    // Node rejection message: "transaction has 106000 fees which is under the required amount of 203600 for compute mass 2036"
    const recipient = "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980";
    const change = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
    const computeDominatedTx = {
      inputCount: 1,
      outputs: [{ address: recipient }, { address: change }],
      payloadBytes: 0
    };

    const massResult = calculateConsensusNonContextualMass(computeDominatedTx);
    expect(massResult.computeMass).toBe(2036n);
    expect(massResult.feeMass).toBe(2036n);

    // The planner (the Generator) pays exactly the amount the node required for this shape.
    const k: any = loadManagedKaspaWasmSync();
    const plan = await planWithGenerator({
      networkId: "simnet",
      utxos: [
        {
          outpoint: { transactionId: "ab".repeat(32), index: 0 },
          address: change,
          amountSompi: 10_000_000n * 100_000_000n,
          scriptPublicKey: String(k.payToAddressScript(change).script)
        }
      ],
      outputs: [{ address: recipient, amountSompi: 9_000_000n * 100_000_000n }],
      changeAddress: change
    });
    expect(plan.mass).toBe(2036n);
    expect(plan.feeSompi).toBe(203600n);
  });

  it("QF-005-A2: payload-heavy fixture: the payload adds mass", () => {
    const payloadHeavyTx = {
      inputCount: 1,
      outputs: [{ address: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980" }],
      payloadBytes: 5000
    };
    const withoutPayload = estimateTransactionMass({ ...payloadHeavyTx, payloadBytes: 0 });
    const withPayload = estimateTransactionMass(payloadHeavyTx);
    expect(withPayload.mass).toBeGreaterThan(withoutPayload.mass);
    expect(withPayload.feeSompi).toBeGreaterThan(withoutPayload.feeSompi);
  });
});
