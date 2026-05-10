import { describe, it, expect } from "vitest";
import { canonicalStringify, calculateContentHash } from "../src/canonical.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";

describe("Artifact Determinism", () => {
  it("should exclude non-semantic fields from canonical stringification", () => {
    const obj1 = {
      schema: "test",
      data: "foo",
      createdAt: "2021-01-01T00:00:00Z",
      rpcUrl: "http://old.node"
    };
    const obj2 = {
      schema: "test",
      data: "foo",
      createdAt: "2024-05-13T12:00:00Z", // Different time
      rpcUrl: "ws://new.node"             // Different transport
    };

    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
    expect(calculateContentHash(obj1)).toBe(calculateContentHash(obj2));
  });

  it("should generate deterministic planId from semantic content", () => {
    const options: any = {
      networkId: "simnet",
      mode: "simulated",
      from: { address: "alice", input: "alice" },
      to: { address: "bob", input: "bob" },
      amountSompi: 100000000n,
      plan: {
        estimatedFeeSompi: 1000n,
        estimatedMass: 200n,
        inputs: [],
        outputs: []
      }
    };

    const artifact1 = createTxPlanArtifact(options);
    
    // Simulate a time delay
    const artifact2 = createTxPlanArtifact(options);

    expect(artifact1.planId).toBe(artifact2.planId);
    expect(artifact1.contentHash).toBe(artifact2.contentHash);
    expect(artifact1.planId).toMatch(/^plan-[0-9a-f]{16}$/);
  });
});
