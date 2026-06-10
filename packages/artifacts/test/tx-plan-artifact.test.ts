import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect } from "vitest";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { ARTIFACT_VERSION } from "../src/schemas.js";
import { asNetworkId } from "@hardkas/core";

describe("TxPlanArtifact", () => {
  it("should create a valid artifact from a plan", () => {
    const plan: any = {
      inputs: [
        {
          outpoint: { transactionId: "tx1", index: 0 },
          amountSompi: 1000n,
          address: "addr1",
          scriptPublicKey: "spk"
        }
      ],
      outputs: [{ address: "addr2", amountSompi: 500n }],
      change: { address: "addr1", amountSompi: 490n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };

    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "addr1", accountName: "Alice" },
      to: { input: "addr2", address: "addr2" },
      amountSompi: 500n,
      plan
    });

    expect(artifact.schema).toBe("hardkas.txPlan");
    expect(artifact.version).toBe(ARTIFACT_VERSION);
    expect(artifact.amountSompi).toBe("500");
    expect(artifact.inputs).toHaveLength(1);
    expect(artifact.inputs[0]!.amountSompi).toBe("1000");
    expect(artifact.estimatedFeeSompi).toBe("10");
    expect(artifact.contentHash).toBeDefined();

    // Test defaults
    expect(artifact.workflowId).toBeDefined();
    expect(artifact.workflowId).toMatch(/^wf_/);
    expect(artifact.assumptionLevel).toBe("local-simulated");
  });

  it("same tx intent twice -> same workflowId if inputs identical", () => {
    const plan: any = {
      inputs: [
        {
          outpoint: { transactionId: "tx1", index: 0 },
          amountSompi: 1000n,
          address: "addr1",
          scriptPublicKey: "spk"
        }
      ],
      outputs: [{ address: "addr2", amountSompi: 500n }],
      change: { address: "addr1", amountSompi: 490n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };

    const artifact1 = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "addr1", accountName: "Alice" },
      to: { input: "addr2", address: "addr2" },
      amountSompi: 500n,
      plan
    });

    const artifact2 = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "addr1", accountName: "Alice" },
      to: { input: "addr2", address: "addr2" },
      amountSompi: 500n,
      plan
    });

    expect(artifact1.workflowId).toBe(artifact2.workflowId);
    expect(artifact1.planId).toBe(artifact2.planId);
  });

  it("different amount -> different workflowId", () => {
    const plan1: any = {
      inputs: [
        {
          outpoint: { transactionId: "tx1", index: 0 },
          amountSompi: 1000n,
          address: "addr1",
          scriptPublicKey: "spk"
        }
      ],
      outputs: [{ address: "addr2", amountSompi: 500n }],
      change: { address: "addr1", amountSompi: 490n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };

    const plan2: any = {
      inputs: [
        {
          outpoint: { transactionId: "tx1", index: 0 },
          amountSompi: 1000n,
          address: "addr1",
          scriptPublicKey: "spk"
        }
      ],
      outputs: [{ address: "addr2", amountSompi: 501n }],
      change: { address: "addr1", amountSompi: 489n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };

    const artifact1 = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "addr1", accountName: "Alice" },
      to: { input: "addr2", address: "addr2" },
      amountSompi: 500n,
      plan: plan1
    });

    const artifact2 = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "addr1", accountName: "Alice" },
      to: { input: "addr2", address: "addr2" },
      amountSompi: 501n,
      plan: plan2
    });

    expect(artifact1.workflowId).not.toBe(artifact2.workflowId);
  });

  it("explicit --workflow-id and --assumption-level respected and hashed", () => {
    const plan: any = {
      inputs: [
        {
          outpoint: { transactionId: "tx1", index: 0 },
          amountSompi: 1000n,
          address: "addr1",
          scriptPublicKey: "spk"
        }
      ],
      outputs: [{ address: "addr2", amountSompi: 500n }],
      change: { address: "addr1", amountSompi: 490n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };

    const artifact = createTxPlanArtifact({
      ctx: {
        ...systemRuntimeContext,
        workflowId: "wf_custom_123",
        assumptionLevel: "custom-level"
      },
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "addr1", accountName: "Alice" },
      to: { input: "addr2", address: "addr2" },
      amountSompi: 500n,
      plan
    });

    expect(artifact.workflowId).toBe("wf_custom_123");
    expect(artifact.assumptionLevel).toBe("custom-level");
  });
});
