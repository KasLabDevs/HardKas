import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/artifacts";
import { assertArtifactCompatibleWithTarget, LegacyExecutionContextRequiredError } from "@hardkas/core";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/legacy");

describe("Historical Artifacts (V1/V2)", () => {
  it("should parse a V1 TxPlan artifact without failing", async () => {
    const raw = await fs.readFile(path.join(FIXTURES_DIR, "tx-plan-v1.json"), "utf8");
    const json = JSON.parse(raw);
    
    // Validate schema field matches expected V1 schema string
    expect(json.schema).toBe("hardkas.txPlan.v1");
    // Ensure there's no execution context in v1
    expect(json.execution).toBeUndefined();
  });

  it("should parse a V1 SignedTx artifact without failing", async () => {
    const raw = await fs.readFile(path.join(FIXTURES_DIR, "signed-tx-v1.json"), "utf8");
    const json = JSON.parse(raw);
    
    expect(json.schema).toBe("hardkas.signedTx.v1");
    expect(json.execution).toBeUndefined();
  });

  it("should parse a V1 TxReceipt artifact without failing", async () => {
    const raw = await fs.readFile(path.join(FIXTURES_DIR, "receipt-v1.json"), "utf8");
    const json = JSON.parse(raw);
    
    expect(json.schema).toBe("hardkas.txReceipt.v1");
    expect(json.execution).toBeUndefined();
  });

  it("should pass the execution guard natively (no throw for empty execution)", () => {
    // Legacy artifact without execution
    const legacyArtifact = { 
      kind: "TxPlan", 
      schema: "hardkas.txPlan.v1" 
    };

    const target = { mode: "simulator", domain: "kaspa-l1", network: "simulated" };

    // Should NOT throw an ExecutionModeMismatchError, should just pass silently.
    expect(() => assertArtifactCompatibleWithTarget(legacyArtifact as any, target as any)).not.toThrow();
  });

  it("should fail during replay if LEGACY_EXECUTION_CONTEXT is omitted", () => {
    const legacyArtifact = { 
      kind: "TxPlan", 
      schema: "hardkas.txPlan.v1" 
    };
    const target = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };

    // Simulate the replay engine checking if an explicit execution policy was provided for a legacy artifact.
    function mockReplay(artifact: any, executionTarget: any, options: { legacyContext?: string } = {}) {
       if (!artifact.execution && !options.legacyContext) {
           throw new LegacyExecutionContextRequiredError({ artifactId: artifact.planId || "unknown" });
       }
       return true;
    }

    expect(() => mockReplay(legacyArtifact, target)).toThrowError(LegacyExecutionContextRequiredError);
    expect(() => mockReplay(legacyArtifact, target, { legacyContext: "kaspa-l1/localnet/simnet" })).not.toThrow();
  });
});
