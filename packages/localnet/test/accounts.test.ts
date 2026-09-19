import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect } from "vitest";
import { resolveAccountAddress, createDeterministicAccounts } from "../src/accounts";
import { SOMPI_PER_KAS } from "@hardkas/core";

describe("localnet accounts", () => {
  describe("resolveAccountAddress", () => {
    it("should resolve alice alias", () => {
      expect(resolveAccountAddress("alice")).toBe("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
    });

    it("should resolve bob alias case-insensitive", () => {
      // DEF-27 (Wave 4): bob is now the canonical scheme-2 derivation at
      // index 1. Prior literal was a placeholder that failed
      // new kaspa.Address() validation. The Wave 4 regression file mechanically
      // proves this value equals scheme2Derive(1).address.
      expect(resolveAccountAddress("BOB")).toBe("kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980");
    });

    it("should return direct kaspa:sim_ addresses as-is", () => {
      expect(resolveAccountAddress("kaspa:sim_test")).toBe("kaspa:sim_test");
    });

    it("should throw for unknown aliases", () => {
      expect(() => resolveAccountAddress("unknown")).toThrow(
        "Unknown account alias: unknown"
      );
    });
  });

  describe("createDeterministicAccounts", () => {
    it("should create default accounts with 1000 KAS", () => {
      const accounts = createDeterministicAccounts();
      expect(accounts).toHaveLength(5);
      expect(accounts[0]?.name).toBe("alice");
      expect(accounts[0]?.balanceSompi).toBe(1000n * SOMPI_PER_KAS);
    });

    it("should respect custom count and balance", () => {
      const accounts = createDeterministicAccounts({
        count: 2,
        initialBalanceSompi: 500n * SOMPI_PER_KAS
      });
      expect(accounts).toHaveLength(2);
      expect(accounts[1]?.name).toBe("bob");
      expect(accounts[1]?.balanceSompi).toBe(500n * SOMPI_PER_KAS);
    });
  });
});
