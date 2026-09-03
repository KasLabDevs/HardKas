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
    // Isolate cwd to prevent parallel test pollution from writing to root .hardkas
    const acc = resolveHardkasAccount({
      nameOrAddress: "alice",
      config: { cwd: "/tmp/non-existent-isolated-dir" } as any
    });
    expect(acc.name).toBe("alice");
    expect(acc.address).toBe("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
  });

  it("resolveHardkasAccount should resolve direct addresses", () => {
    const acc = resolveHardkasAccount({ nameOrAddress: "kaspa:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn" });
    expect(acc.name).toBe("kaspa:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
    expect(acc.kind).toBe("external-wallet");
    expect(acc.address).toBe("kaspa:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
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
      kind: "kaspa" as const,
      network: "mainnet",
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

  describe("Execution Target Authority", () => {
    it("should resolve explicit localnet target without config to kaspa/simnet", () => {
      const acc = resolveHardkasAccount({
        nameOrAddress: "alice",
        executionTarget: { mode: "localnet", network: "simnet", domain: "kaspa-l1" },
        config: { cwd: "/tmp/non-existent-isolated-dir" } as any
      });
      expect(acc.kind).toBe("kaspa");
      expect((acc as any).network).toBe("simnet");
    });

    it("should resolve explicit rpc target to kaspa/simnet and ignore global simulated config", () => {
      const acc = resolveHardkasAccount({
        nameOrAddress: "alice",
        executionTarget: { mode: "rpc", network: "simnet", domain: "kaspa-l1" },
        config: { defaultNetwork: "simulated", cwd: "/tmp/non-existent-isolated-dir" } as any
      });
      expect(acc.kind).toBe("kaspa");
      expect((acc as any).network).toBe("simnet");
    });

    it("should allow synthetic account if no explicit target and config is simulated", () => {
      const acc = resolveHardkasAccount({
        nameOrAddress: "alice",
        config: { defaultNetwork: "simulated", cwd: "/tmp/non-existent-isolated-dir" } as any
      });
      expect(acc.kind).toBe("synthetic");
      expect((acc as any).executionMode).toBe("simulator");
    });

    it("MUST NOT mutate config during resolution, preventing state leakage between targets", () => {
      const sharedConfig = { defaultNetwork: "simulated", cwd: "/tmp/isolated-dir" };

      const acc1 = resolveHardkasAccount({
        nameOrAddress: "alice",
        executionTarget: { mode: "localnet", network: "simnet", domain: "kaspa-l1" },
        config: sharedConfig as any
      });

      const acc2 = resolveHardkasAccount({
        nameOrAddress: "alice",
        executionTarget: { mode: "simulator", network: "simnet", domain: "kaspa-l1" },
        config: sharedConfig as any
      });

      expect(acc1.kind).toBe("kaspa");
      expect(acc2.kind).toBe("synthetic");
      expect(sharedConfig).toEqual({ defaultNetwork: "simulated", cwd: "/tmp/isolated-dir" }); // Must remain unchanged
    });
  });
});
