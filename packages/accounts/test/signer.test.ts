import { describe, it, expect } from "vitest";
import { signTxPlanArtifact } from "../src/signer.js";
import { TxPlanArtifact } from "@hardkas/artifacts";
import { HardkasAccount } from "../src/types.js";

describe("signTxPlanArtifact", () => {
  const mockSimulatedPlan: any = {
    schema: "hardkas.txPlan",
    version: "1.0.0-alpha",
    hardkasVersion: "0.2.0-alpha",
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
    estimatedFeeSompi: "300"
  };

  const mockRealPlan: any = {
    ...mockSimulatedPlan,
    networkId: "devnet",
    mode: "real"
  };

  const aliceAccount: HardkasAccount = {
    name: "alice",
    kind: "simulated",
    address: "kaspa:sim_alice"
  };

  const realAccount: HardkasAccount = {
    name: "deployer",
    kind: "kaspa-private-key",
    privateKeyEnv: "KASPA_PRIVATE_KEY"
  };

  it("should sign a simulated plan with a simulated account", async () => {
    const signed = await signTxPlanArtifact({
      planArtifact: mockSimulatedPlan,
      account: aliceAccount
    });

    expect(signed.status).toBe("signed");
    expect(signed.from.address).toBe("kaspa:sim_alice");
    expect(signed.signedTransaction?.format).toBe("simulated");
  });

  it("should throw error when signing real plan with simulated account", async () => {
    await expect(signTxPlanArtifact({
      planArtifact: mockRealPlan,
      account: aliceAccount
    })).rejects.toThrow(/Real Kaspa transaction plans.*cannot be signed with simulated accounts/);
  });

  it("should throw error when signing simulated plan with real account", async () => {
    await expect(signTxPlanArtifact({
      planArtifact: mockSimulatedPlan,
      account: realAccount
    })).rejects.toThrow(/Simulated plans must be signed with simulated accounts/);
  });

  it("should throw error for real Kaspa signing if backend is unavailable", async () => {
    // Backend will be unavailable in test env as 'kaspa' is not installed
    await expect(signTxPlanArtifact({
      planArtifact: mockRealPlan,
      account: realAccount
    })).rejects.toThrow(/Real Kaspa signing is not available/);
  });

  it("should block mainnet signing by default", async () => {
    const mainnetPlan: any = {
      ...mockRealPlan,
      networkId: "mainnet"
    };

    await expect(signTxPlanArtifact({
      planArtifact: mainnetPlan,
      account: realAccount
    })).rejects.toThrow(/Mainnet signing is disabled by default/);
  });

  it("should allow mainnet signing if allowMainnet is true", async () => {
    const mainnetPlan: TxPlanArtifact = {
      ...mockRealPlan,
      network: "mainnet"
    };

    // It will still fail due to missing backend, but NOT due to mainnet guard
    await expect(signTxPlanArtifact({
      planArtifact: mainnetPlan,
      account: realAccount,
      allowMainnet: true
    })).rejects.not.toThrow(/Mainnet signing is disabled by default/);
  });
});
