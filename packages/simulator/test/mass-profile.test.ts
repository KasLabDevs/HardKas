import { describe, it, expect } from "vitest";
import { 
  profileMass, 
  compareMassProfiles, 
  formatMassProfile, 
  formatMassComparison 
} from "../src/index.js";

describe("Mass Profiling", () => {
  it("profileMass returns positive values", () => {
    const b = profileMass({ inputCount: 2, outputCount: 2 });
    expect(b.totalMass).toBeGreaterThan(0n);
    expect(b.inputMass).toBeGreaterThan(0n);
    expect(b.outputMass).toBeGreaterThan(0n);
    expect(b.estimatedFeeSompi).toBeGreaterThan(0n);
  });

  it("more inputs = more mass", () => {
    const small = profileMass({ inputCount: 1, outputCount: 1 });
    const large = profileMass({ inputCount: 10, outputCount: 1 });
    expect(large.totalMass).toBeGreaterThan(small.totalMass);
  });

  it("higher fee rate = higher fee", () => {
    const low = profileMass({ inputCount: 2, outputCount: 2, feeRate: 1n });
    const high = profileMass({ inputCount: 2, outputCount: 2, feeRate: 10n });
    expect(high.estimatedFeeSompi).toBeGreaterThan(low.estimatedFeeSompi);
  });

  it("comparison detects regression", () => {
    const prev = profileMass({ inputCount: 2, outputCount: 2 });
    const curr = profileMass({ inputCount: 10, outputCount: 2 });
    const cmp = compareMassProfiles(curr, prev);
    expect(cmp.isRegression).toBe(true);
    expect(cmp.massDelta).toBeGreaterThan(0n);
  });

  it("comparison detects no regression", () => {
    const prev = profileMass({ inputCount: 5, outputCount: 2 });
    const curr = profileMass({ inputCount: 2, outputCount: 2 });
    const cmp = compareMassProfiles(curr, prev);
    expect(cmp.isRegression).toBe(false);
  });

  it("formatMassProfile produces readable output", () => {
    const b = profileMass({ inputCount: 2, outputCount: 3 });
    const text = formatMassProfile(b);
    expect(text).toContain("Inputs");
    expect(text).toContain("Outputs");
    expect(text).toContain("Total mass");
  });

  it("formatMassComparison shows delta", () => {
    const prev = profileMass({ inputCount: 2, outputCount: 2 });
    const curr = profileMass({ inputCount: 5, outputCount: 2 });
    const cmp = compareMassProfiles(curr, prev);
    const text = formatMassComparison(cmp);
    expect(text).toContain("Delta");
    expect(text).toContain("%");
  });

  it("deterministic — same inputs same profile", () => {
    const a = profileMass({ inputCount: 3, outputCount: 2 });
    const b = profileMass({ inputCount: 3, outputCount: 2 });
    expect(a.totalMass).toBe(b.totalMass);
    expect(a.estimatedFeeSompi).toBe(b.estimatedFeeSompi);
  });
});
