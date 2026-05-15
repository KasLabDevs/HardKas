import { describe, it, expect } from "vitest";
import { generateReproducibilityReport } from "../src/reproducibility.js";
import golden from "./golden/reproducibility.json";

describe("Reproducibility Proof v0", () => {
  const actual = generateReproducibilityReport();

  it("proof version matches", () => {
    expect(actual.proofVersion).toBe("repro-v0");
  });

  it("all artifact hashes are 64-char hex", () => {
    for (const [key, hash] of Object.entries(actual.artifacts)) {
      expect(hash, `${key} is not valid hex`).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("L1 plan hash is reproducible", () => {
    expect(actual.artifacts.l1Plan).toBe(golden.artifacts.l1Plan);
  });

  it("L1 signed hash is reproducible", () => {
    expect(actual.artifacts.l1Signed).toBe(golden.artifacts.l1Signed);
  });

  it("L2 Igra plan hash is reproducible", () => {
    expect(actual.artifacts.igraPlan).toBe(golden.artifacts.igraPlan);
  });

  it("DAG linear scenario hash is reproducible", () => {
    expect(actual.artifacts.dagLinearScenario).toBe(golden.artifacts.dagLinearScenario);
  });

  it("DAG wide scenario hash is reproducible", () => {
    expect(actual.artifacts.dagWideScenario).toBe(golden.artifacts.dagWideScenario);
  });

  it("Mass profile hash is reproducible", () => {
    expect(actual.artifacts.massProfile).toBe(golden.artifacts.massProfile);
  });

  it("Canonical nested hash is reproducible", () => {
    expect(actual.artifacts.canonicalNested).toBe(golden.artifacts.canonicalNested);
  });

  it("Simulated tx receipt hash is reproducible", () => {
    expect(actual.artifacts.simulatedTxReceipt).toBe(golden.artifacts.simulatedTxReceipt);
  });

  it("all artifact hashes match golden", () => {
    expect(actual.artifacts).toEqual(golden.artifacts);
  });

  it("prints semantic diff if any hash diverges", () => {
    const mismatches: string[] = [];
    for (const [key, expectedHash] of Object.entries(golden.artifacts)) {
      const actualHash = (actual.artifacts as any)[key];
      if (actualHash !== expectedHash) {
        mismatches.push(`${key}: expected=${expectedHash} actual=${actualHash}`);
      }
    }
    if (mismatches.length > 0) {
      console.error("\n═══ REPRODUCIBILITY DIVERGENCE ═══");
      for (const m of mismatches) console.error(`  ✗ ${m}`);
      console.error("═══════════════════════════════════\n");
    }
    expect(mismatches).toEqual([]);
  });
});
