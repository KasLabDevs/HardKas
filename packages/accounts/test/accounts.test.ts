import { describe, it, expect } from "vitest";
import {
  listHardkasAccounts,
  resolveHardkasAccount,
  resolveHardkasAccountAddress,
  describeAccount
} from "../src";
import { maskSecrets } from "@hardkas/core";
import type { HardkasConfig } from "@hardkas/config";

describe("accounts", () => {
  it("listHardkasAccounts should return deterministic accounts by default", () => {
    const accounts = listHardkasAccounts();
    expect(accounts.length).toBeGreaterThanOrEqual(3);
    expect(accounts.some((a) => a.name === "alice")).toBe(true);
    expect(accounts.some((a) => a.name === "bob")).toBe(true);
  });

  it("resolveHardkasAccount should resolve 'alice'", () => {
    const acc = resolveHardkasAccount({ nameOrAddress: "alice" });
    expect(acc.name).toBe("alice");
    expect(acc.address).toBe("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
  });

  it("resolveHardkasAccount should resolve direct addresses", () => {
    const acc = resolveHardkasAccount({ nameOrAddress: "kaspa:sim_custom" });
    expect(acc.name).toBe("kaspa:sim_custom");
    expect(acc.kind).toBe("external-wallet");
    expect(acc.address).toBe("kaspa:sim_custom");
  });

  it("resolveHardkasAccountAddress should return address for known account", async () => {
    const addr = await resolveHardkasAccountAddress("bob");
    expect(addr.startsWith("kaspasim:") || addr.startsWith("kaspa:")).toBe(true);
  });

  it("resolveHardkasAccountAddress should use config if provided", async () => {
    const config: HardkasConfig = {
      accounts: {
        treasury: { kind: "simulated", address: "kaspasim:treasury" }
      }
    };
    const addr = await resolveHardkasAccountAddress("treasury", config);
    expect(addr).toBe("kaspasim:treasury");
  });

  it("resolveHardkasAccount should throw for unknown account", () => {
    expect(() => resolveHardkasAccount({ nameOrAddress: "non-existent" })).toThrow(
      /Unknown HardKAS account 'non-existent'/
    );
  });

  it("describeAccount should not leak secrets", () => {
    const acc = {
      name: "deployer",
      kind: "kaspa-private-key" as const,
      privateKeyEnv: "SECRET_KEY",
      address: "kaspa:q...1"
    };
    const desc = describeAccount(acc);
    expect(desc).toHaveProperty("name", "deployer");
    expect(desc).toHaveProperty("privateKeyEnv", "SECRET_KEY");
    expect(desc).not.toHaveProperty("privateKey");
  });

  it("maskSecrets should mask private keys", () => {
    const pk = "1".repeat(64);
    expect(maskSecrets(pk)).toBe("111111...1111 [REDACTED]");
  });
});
