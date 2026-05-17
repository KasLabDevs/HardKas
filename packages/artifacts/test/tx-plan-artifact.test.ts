import { describe, it, expect } from "vitest";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { ARTIFACT_VERSION } from "../src/schemas.js";
import { asNetworkId } from "@hardkas/core";

describe("TxPlanArtifact", () => {
  it("should create a valid artifact from a plan", () => {
    const plan: any = {
      inputs: [{
        outpoint: { transactionId: "tx1", index: 0 },
        amountSompi: 1000n,
        address: "addr1",
        scriptPublicKey: "spk"
      }],
      outputs: [{ address: "addr2", amountSompi: 500n }],
      change: { address: "addr1", amountSompi: 490n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };

    const artifact = createTxPlanArtifact({
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
  });
});
