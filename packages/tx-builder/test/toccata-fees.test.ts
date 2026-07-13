import { describe, it, expect } from "vitest";
import { estimateToccataFee, estimateTransactionMass } from "../src/mass.js";

describe("P83: Toccata Fee Model", () => {
  it("should enforce the fee floor based on compute_mass when compute_mass > 2 * tx_bytes", () => {
    const txBytes = 500n; // 2 * txBytes = 1000
    const txMass = 500n;
    const computeBudget = 10n; // 10 grams * 100 = 1000. computeMass = 500 + 1000 = 1500
    
    const fee = estimateToccataFee(computeBudget, txMass, txBytes);
    
    // 100 * max(1500, 1000) = 150000
    expect(fee).toBe(150000n);
  });

  it("should enforce the fee floor based on 2 * tx_bytes when compute_mass < 2 * tx_bytes", () => {
    const txBytes = 500n; // 2 * txBytes = 1000
    const txMass = 500n;
    const computeBudget = 0n; // computeMass = 500 + 0 * 100 = 500
    
    const fee = estimateToccataFee(computeBudget, txMass, txBytes);
    
    // 100 * max(500, 1000) = 100000
    expect(fee).toBe(100000n);
  });

  it("should calculate txBytes as part of mass estimation", () => {
    const result = estimateTransactionMass({
      inputCount: 2,
      outputs: [
        { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" }
      ],
      hasChange: true
    });
    
    // 100 (base) + 2*160 (inputs) + 400 (output) + 400 (change) = 1220
    expect(result.mass).toBe(1220n);
    expect(result.txBytes).toBe(1220n);
  });
});
