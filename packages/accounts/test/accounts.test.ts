import { describe, it, expect } from "vitest";
import { 
  listHardkasAccounts, 
  resolveHardkasAccount, 
  resolveHardkasAccountAddress, 
  describeAccount
} from "../src";
import { maskSecrets } from "@hardkas/core";

describe("accounts", () => {
  it("listHardkasAccounts should return deterministic accounts by default", () => {
    const accounts = listHardkasAccounts();
    expect(accounts.length).toBeGreaterThanOrEqual(3);
    expect(accounts.some(a => a.name === "alice")).toBe(true);
    expect(accounts.some(a => a.name === "bob")).toBe(true);
  });

  it("resolveHardkasAccount should resolve 'alice'", () => {
    const acc = resolveHardkasAccount({ nameOrAddress: "alice" });
    expect(acc.name).toBe("alice");
    expect(acc.address).toBe("kaspasim:alice");
  });

  it("resolveHardkasAccount should resolve direct addresses", () => {
    const acc = resolveHardkasAccount({ nameOrAddress: "kaspasim:custom" });
    expect(acc.name).toBe("kaspasim:custom");
    expect(acc.kind).toBe("external-wallet");
    expect(acc.address).toBe("kaspasim:custom");
  });

  it("resolveHardkasAccountAddress should return address for known account", () => {
    const addr = resolveHardkasAccountAddress("bob");
    expect(addr).toBe("kaspasim:bob");
  });

  it("resolveHardkasAccountAddress should use config if provided", () => {
    const config = {
      accounts: {
        treasury: { kind: "simulated" as const, address: "kaspasim:treasury" }
      }
    };
    const addr = resolveHardkasAccountAddress("treasury", config);
    expect(addr).toBe("kaspasim:treasury");
  });

  it("resolveHardkasAccount should throw for unknown account", () => {
    expect(() => resolveHardkasAccount({ nameOrAddress: "non-existent" }))
      .toThrow(/Unknown HardKAS account 'non-existent'/);
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
