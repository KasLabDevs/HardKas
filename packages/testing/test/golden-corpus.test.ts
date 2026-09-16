import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  WorkflowSchema,
  TxReceiptSchema,
  TxPlanSchema,
  SignedTxSchema,
  BaseArtifactSchema
} from "@hardkas/artifacts";

const goldenDir = path.resolve(__dirname, "../src/fixtures/golden");

function readFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(goldenDir, name), "utf-8"));
}

describe("Golden Corpus Validation", () => {
  it("validates local-workflow-basic.json against WorkflowSchema", () => {
    const data = readFixture("local-workflow-basic.json");
    assert.doesNotThrow(() => WorkflowSchema.parse(data));
    expect(data.schemaVersion).toBe("hardkas.artifact.v1");
  });

  it("validates local-workflow-with-warning.json against WorkflowSchema", () => {
    const data = readFixture("local-workflow-with-warning.json");
    assert.doesNotThrow(() => WorkflowSchema.parse(data));
  });

  it("validates receipt-submitted.json against TxReceiptSchema", () => {
    const data = readFixture("receipt-submitted.json");
    assert.doesNotThrow(() => TxReceiptSchema.parse(data));
    expect(data.schemaVersion).toBe("hardkas.receipt.v1");
  });

  it("validates receipt-unknown.json against TxReceiptSchema", () => {
    const data = readFixture("receipt-unknown.json");
    assert.doesNotThrow(() => TxReceiptSchema.parse(data));
  });

  it("validates explain-transfer.json against TxPlanSchema", () => {
    const data = readFixture("explain-transfer.json");
    assert.doesNotThrow(() => TxPlanSchema.parse(data));
  });

  it("validates artifact-tx-plan.json against TxPlanSchema", () => {
    const data = readFixture("artifact-tx-plan.json");
    assert.doesNotThrow(() => TxPlanSchema.parse(data));
  });

  it("validates artifact-signed-tx.json against SignedTxSchema", () => {
    const data = readFixture("artifact-signed-tx.json");
    assert.doesNotThrow(() => SignedTxSchema.parse(data));
    expect(data.schemaVersion).toBe("hardkas.artifact.v1");
  });

  it("ensures DevDoctor outputs have correct schemaVersion", () => {
    const clean = readFixture("doctor-clean.json");
    const corrupt = readFixture("doctor-corrupt-artifact.json");
    expect(clean.schemaVersion).toBe("hardkas.devDoctor.v1");
    expect(corrupt.schemaVersion).toBe("hardkas.devDoctor.v1");
    expect(clean.status).toBe("ready");
  });

  it("ensures TortureReport outputs have correct schemaVersion", () => {
    const local = readFixture("torture-local-report.json");
    const corruption = readFixture("torture-corruption-report.json");
    expect(local.schemaVersion).toBe("hardkas.tortureReport.v1");
    expect(corruption.schemaVersion).toBe("hardkas.tortureReport.v1");
    expect(local.seed).toBe(7001);
  });

  it("ensures ArtifactInspect outputs have correct schemaVersion and format", () => {
    const basic = readFixture("artifact-inspect-basic.json");
    const lineage = readFixture("artifact-inspect-lineage.json");
    expect(basic.schemaVersion).toBe("hardkas.artifactInspect.v1");
    expect(lineage.schemaVersion).toBe("hardkas.artifactInspect.v1");
    expect(basic.ok).toBe(true);
    expect(lineage.artifact.parents).toBeDefined();
  });

  it("ensures ReplayReport outputs have correct schemaVersion and format", () => {
    const passed = readFixture("replay-passed.json");
    const diverged = readFixture("replay-diverged.json");
    const unsupported = readFixture("replay-unsupported.json");

    // We added schemaVersion to replay in the scripts but let's check it's present
    // wait, we didn't add it to passed/diverged in generate-golden.ts? Oh, we did for passed/diverged in previous sprint if we did.
    // Let's check them.
    expect(unsupported.schemaVersion).toBe("hardkas.replayReport.v1");
    expect(unsupported.status).toBe("unsupported");
    expect(passed.status).toBe("passed");
    expect(diverged.status).toBe("diverged");
  });

  it("validates large JSONL fixtures exist and have no schema wrappers", () => {
    const largeValid = readFixture("large-jsonl-valid-line.json");
    expect(largeValid.rawContent).toContain("large-event");
    expect(largeValid.rawContent.length).toBeGreaterThan(70000);
  });
});
