import { describe, it, expect } from "vitest";
import { resolveHardkasAccount, assertAccountCompatible } from "../src/resolve.js";

describe("QF-007: ExecutionTarget Authority Governing Account Resolution", () => {
  const simulatorTarget = { mode: "simulator" as const, domain: "kaspa-l1" as const, network: "simulated" };
  const localnetTarget = { mode: "localnet" as const, domain: "kaspa-l1" as const, network: "simnet" };
  const rpcTarget = { mode: "rpc" as const, domain: "kaspa-l1" as const, network: "simnet" };

  it("1. Simulator execution mode resolves synthetic account (kaspa:sim_*)", () => {
    const account = resolveHardkasAccount({
      nameOrAddress: "alice",
      executionTarget: simulatorTarget
    });

    expect(account.kind).toBe("synthetic");
    expect((account as any).executionMode).toBe("simulator");
    expect(account.address).toBe("kaspa:sim_alice");
  });

  it("2. Localnet/Simnet execution mode resolves real deterministic account (kaspasim:*)", () => {
    const account = resolveHardkasAccount({
      nameOrAddress: "alice",
      executionTarget: localnetTarget
    });

    expect(account.kind).toBe("kaspa");
    expect((account as any).network).toBe("simnet");
    expect(account.address).toBe("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
  });

  it("3. Raw kaspasim:* address is NEVER classified as synthetic", () => {
    const rawAddr = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
    const account = resolveHardkasAccount({
      nameOrAddress: rawAddr,
      executionTarget: simulatorTarget
    });

    expect(account.kind).toBe("external-wallet");
    // @ts-ignore
    expect(account.kind).not.toBe("synthetic");
    expect(account.address).toBe(rawAddr);
  });

  it("4. Synthetic account used with non-simulator target throws AccountNetworkMismatchError", () => {
    const syntheticAccount = resolveHardkasAccount({
      nameOrAddress: "alice",
      executionTarget: simulatorTarget
    });

    expect(() => assertAccountCompatible(syntheticAccount, localnetTarget)).toThrow();
    expect(() => assertAccountCompatible(syntheticAccount, rpcTarget)).toThrow();
  });
});

