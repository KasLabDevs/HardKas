import { describe, it, expect } from "vitest";
import { getL2Profile, validateL2Profile, listL2Profiles } from "../src/index.js";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

describe("L2 Profiles Registry", () => {
  it("should find and validate the built-in igra profile", () => {
    const profile = getL2Profile("igra");
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe("igra");
    
    const result = validateL2Profile(profile);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return null for unknown profile", () => {
    expect(getL2Profile("unknown-chain")).toBeNull();
  });

  it("should include igra in listL2Profiles", () => {
    const profiles = listL2Profiles();
    expect(profiles.some(p => p.name === "igra")).toBe(true);
  });

  it("should reject profile with wrong schema", () => {
    const invalid = {
      schema: "wrong.schema",
      hardkasVersion: HARDKAS_VERSION,
      name: "test",
      type: "evm-based-rollup",
      settlementLayer: "kaspa",
      executionLayer: "evm",
      gasToken: "TEST",
      security: {
        bridgePhase: "pre-zk",
        trustlessExit: false,
        custodyModel: "test",
        riskProfile: "high",
        notes: ["test"]
      }
    };
    const result = validateL2Profile(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("Invalid schema"))).toBe(true);
  });

  it("should reject trustlessExit=true when bridgePhase is not zk", () => {
    const invalid = {
      schema: "hardkas.l2Profile.v1",
      hardkasVersion: HARDKAS_VERSION,
      name: "test",
      type: "evm-based-rollup",
      settlementLayer: "kaspa",
      executionLayer: "evm",
      gasToken: "TEST",
      security: {
        bridgePhase: "pre-zk",
        trustlessExit: true, // INVALID for pre-zk
        custodyModel: "test",
        riskProfile: "high",
        notes: ["test"]
      }
    };
    const result = validateL2Profile(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes("security invariant violation"))).toBe(true);
  });

  it("should allow trustlessExit=true when bridgePhase is zk", () => {
    const valid = {
      schema: "hardkas.l2Profile.v1",
      hardkasVersion: HARDKAS_VERSION,
      name: "test",
      type: "evm-based-rollup",
      settlementLayer: "kaspa",
      executionLayer: "evm",
      gasToken: "TEST",
      security: {
        bridgePhase: "zk",
        trustlessExit: true,
        custodyModel: "test",
        riskProfile: "low",
        notes: ["test"]
      }
    };
    const result = validateL2Profile(valid);
    expect(result.ok).toBe(true);
  });
});
