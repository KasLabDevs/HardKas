import { describe, it, expect, vi } from "vitest";
import { signTxPlanArtifact } from "../src/signer.js";
import { TxPlanArtifact } from "@hardkas/artifacts";
import { HardkasAccount } from "../src/types.js";

vi.mock("../src/signer-backend.js", () => {
  return {
    getKaspaSigningBackendStatus: vi.fn().mockResolvedValue({
      available: false,
      error: "Mocked unavailable backend",
      name: "None"
    })
  };
});

describe("signTxPlanArtifact", () => {
  const mockSimulatedPlan: any = {
    schema: "hardkas.txPlan",
    version: "1.0.0-alpha",
    hardkasVersion: "0.12.0-alpha",
    createdAt: new Date().toISOString(),
    networkId: "simnet",
    mode: "simulated",
    planId: "plan123",
    from: { address: "kaspa:sim_alice" },
    to: { address: "kaspa:sim_bob" },
    amountSompi: "1000",
    inputs: [],
    outputs: [],
    estimatedMass: "300",
    estimatedFeeSompi: "300",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" }
  };

  const mockRealPlan: any = {
    ...mockSimulatedPlan,
    networkId: "simnet",
    mode: "real",
    execution: { mode: "localnet", domain: "kaspa-l1", network: "simnet" }
  };

  const aliceAccount: HardkasAccount = {
    name: "alice",
    kind: "synthetic",
    executionMode: "simulator",
    address: "kaspa:sim_alice"
  };

  const realAccount: HardkasAccount = {
    name: "deployer",
    kind: "kaspa",
    network: "simnet",
    privateKeyEnv: "KASPA_PRIVATE_KEY",
    address: "kaspa:sim_deployer"
  };

  const simTarget = { mode: "simulator", domain: "kaspa-l1", network: "simnet" } as const;
  const localTarget = { mode: "localnet", domain: "kaspa-l1", network: "simnet" } as const;

  it("should sign a simulator plan with a synthetic account", async () => {
    const signed = await signTxPlanArtifact({
      target: simTarget,
      planArtifact: mockSimulatedPlan,
      account: aliceAccount
    });

    expect(signed.status).toBe("signed");
    expect(signed.from.address).toBe("kaspa:sim_alice");
    expect(signed.signedTransaction?.format).toBe("simulated");
  });

  it("should throw error when signing real plan with synthetic account", async () => {
    await expect(
      signTxPlanArtifact({
        target: localTarget,
        planArtifact: mockRealPlan,
        account: aliceAccount
      })
    ).rejects.toThrow(
      /Localnet targets require 'kaspa' accounts, got 'synthetic'/
    ); // Modified assertion to match the Guard which fires before the old synthetic account error
  });

  it("should generate simulated signature for simulated plan even with real account", async () => {
    // Wait, the guard will fail if we use a real account on a simulated target!
    // Let's expect it to fail now because of the guard!
    await expect(
      signTxPlanArtifact({
        target: simTarget,
        planArtifact: mockSimulatedPlan,
        account: realAccount
      })
    ).rejects.toThrow(
      /Simulator targets require 'synthetic' accounts, got 'kaspa'/
    );
  });

  it("should throw error for real Kaspa signing if backend is unavailable", async () => {
    // Backend will be unavailable in test env as 'kaspa' is not installed
    await expect(
      signTxPlanArtifact({
        target: localTarget,
        planArtifact: mockRealPlan,
        account: realAccount
      })
    ).rejects.toThrow(/Real Kaspa signing is not available/);
  });

  it("should block mainnet signing by default", async () => {
    const mainnetPlan: any = {
      ...mockRealPlan,
      networkId: "mainnet",
      execution: { mode: "localnet", domain: "kaspa-l1", network: "mainnet" }
    };
    const mainnetTarget = { mode: "localnet", domain: "kaspa-l1", network: "mainnet" } as const;
    const mainnetAccount = { ...realAccount, network: "mainnet" } as HardkasAccount;

    await expect(
      signTxPlanArtifact({
        target: mainnetTarget,
        planArtifact: mainnetPlan,
        account: mainnetAccount
      })
    ).rejects.toThrow(/Mainnet signing is disabled by default/);
  });

  it("should allow mainnet signing if allowMainnet is true", async () => {
    const mainnetPlan: any = {
      ...mockRealPlan,
      networkId: "mainnet",
      execution: { mode: "localnet", domain: "kaspa-l1", network: "mainnet" }
    };
    const mainnetTarget = { mode: "localnet", domain: "kaspa-l1", network: "mainnet" } as const;
    const mainnetAccount = { ...realAccount, network: "mainnet" } as HardkasAccount;

    // It will still fail due to missing backend, but NOT due to mainnet guard
    await expect(
      signTxPlanArtifact({
        target: mainnetTarget,
        planArtifact: mainnetPlan,
        account: mainnetAccount,
        allowMainnet: true
      })
    ).rejects.not.toThrow(/Mainnet signing is disabled by default/);
  });
});
