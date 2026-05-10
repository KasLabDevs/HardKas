import { describe, it, expect } from "vitest";
import { resolveAccountAddress, createDeterministicAccounts } from "../src/accounts";
import { SOMPI_PER_KAS } from "@hardkas/core";

describe("localnet accounts", () => {
  describe("resolveAccountAddress", () => {
    it("should resolve alice alias", () => {
      expect(resolveAccountAddress("alice")).toBe("kaspa:sim_alice");
    });

    it("should resolve bob alias case-insensitive", () => {
      expect(resolveAccountAddress("BOB")).toBe("kaspa:sim_bob");
    });

    it("should return direct kaspa: addresses as-is", () => {
      expect(resolveAccountAddress("kaspa:sim_test")).toBe("kaspa:sim_test");
    });

    it("should throw for unknown aliases", () => {
      expect(() => resolveAccountAddress("unknown")).toThrow("Unknown account alias: unknown");
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
