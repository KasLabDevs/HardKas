import { describe, it, expect } from "vitest";
import { 
  listHardkasAccounts, 
  resolveHardkasAccount, 
  resolveHardkasAccountAddress, 
  describeAccount,
  redactSecret
} from "../src";

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
    expect(acc.address).toBe("kaspa:sim_alice");
  });

  it("resolveHardkasAccount should resolve direct addresses", () => {
    const acc = resolveHardkasAccount({ nameOrAddress: "kaspa:sim_custom" });
    expect(acc.name).toBe("kaspa:sim_custom");
    expect(acc.kind).toBe("external-wallet");
    expect(acc.address).toBe("kaspa:sim_custom");
  });

  it("resolveHardkasAccountAddress should return address for known account", () => {
    const addr = resolveHardkasAccountAddress("bob");
    expect(addr).toBe("kaspa:sim_bob");
  });

  it("resolveHardkasAccountAddress should use config if provided", () => {
    const config = {
      accounts: {
        treasury: { kind: "simulated" as const, address: "kaspa:sim_treasury" }
      }
    };
    const addr = resolveHardkasAccountAddress("treasury", config);
    expect(addr).toBe("kaspa:sim_treasury");
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

  it("redactSecret should mask strings", () => {
    expect(redactSecret("123456789012345")).toBe("123456...2345");
    expect(redactSecret("short")).toBe("***");
  });
});
