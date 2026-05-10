import { describe, it, expect } from "vitest";
import { 
  getL2BridgeAssumptions, 
  validateL2BridgeAssumptions, 
  assertValidL2BridgeAssumptions 
} from "../src/bridge.js";

describe("L2 Bridge Awareness", () => {
  it("should retrieve built-in Igra assumptions", () => {
    const assumptions = getL2BridgeAssumptions("igra");
    expect(assumptions).not.toBeNull();
    expect(assumptions?.l2Network).toBe("igra");
    expect(assumptions?.bridgePhase).toBe("pre-zk");
    expect(assumptions?.trustlessExit).toBe(false);
  });

  it("should return null for unknown network", () => {
    expect(getL2BridgeAssumptions("unknown")).toBeNull();
  });

  it("should validate valid assumptions", () => {
    const valid = getL2BridgeAssumptions("igra");
    const result = validateL2BridgeAssumptions(valid);
    expect(result.ok).toBe(true);
  });

  it("should reject trustlessExit=true if phase is pre-zk", () => {
    const invalid = {
      ...(getL2BridgeAssumptions("igra")!),
      trustlessExit: true
    };
    const result = validateL2BridgeAssumptions(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("trustlessExit must be false if bridgePhase is not 'zk'");
  });

  it("should throw on assertValid for invalid input", () => {
    expect(() => assertValidL2BridgeAssumptions({})).toThrow("Invalid L2 bridge assumptions");
  });
});
