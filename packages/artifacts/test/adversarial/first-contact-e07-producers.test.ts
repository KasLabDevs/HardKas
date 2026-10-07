import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createScenarioResultArtifact,
  scenarioModeForNetwork,
  verifyArtifactIntegritySync,
  calculateContentHash,
  CURRENT_HASH_VERSION
} from "../../src/index.js";

// First contact · E03/E07 — everything HardKAS writes into its store must verify
// under HardKAS's own verifier.
//   - scenario results (`@hardkas/testing/scenarios`) and task runs (`hardkas task`)
//     were ad-hoc JSON without hashVersion/contentHash (writer refusal N3, indexer
//     "corrupted"); they are now sealed v5 `hardkas.scenarioResult.v1`.
//   - `hardkas silver compile` records are sealed v5 without a top-level
//     `artifactId` (IC-7.3) but the Zod schema still required one, so the verifier
//     rejected every record the product emits.

const here = path.dirname(fileURLToPath(import.meta.url));
const publishedSilverRecord = () =>
  JSON.parse(fs.readFileSync(path.join(here, "../fixtures/first-contact/silverCompile-v5.published-rc23.json"), "utf8"));

describe("First contact · E07 · scenario results are sealed v5 artifacts", () => {
  it("a scenario result verifies strictly with FULL scope", () => {
    const r: any = createScenarioResultArtifact({
      scenarioName: "payment flow",
      status: "passed",
      networkId: "simulated",
      mode: "simulator",
      artifactsGenerated: ["a".repeat(64)]
    });
    expect(r.schema).toBe("hardkas.scenarioResult.v1");
    expect(r.hashVersion).toBe(CURRENT_HASH_VERSION);
    const v = verifyArtifactIntegritySync(structuredClone(r), { strict: true });
    expect(v.issues.filter((i: any) => i.severity !== "warning")).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.authScope).toBe("FULL");
  });

  it("a task run (scenario result with task metadata) verifies strictly, and its metadata is authenticated", () => {
    const r: any = createScenarioResultArtifact({
      scenarioName: "hello",
      status: "passed",
      networkId: "simulated",
      mode: scenarioModeForNetwork("simulated"),
      metadata: { kind: "task", taskName: "hello", runId: "task_1", args: { name: "bob" }, result: { hello: "bob" } }
    });
    expect(verifyArtifactIntegritySync(structuredClone(r), { strict: true }).ok).toBe(true);
    const tampered = structuredClone(r);
    tampered.metadata.result = { hello: "mallory" };
    expect(calculateContentHash(tampered, CURRENT_HASH_VERSION)).not.toBe(r.contentHash);
    expect(verifyArtifactIntegritySync(tampered, { strict: true }).ok).toBe(false);
  });

  it("a failed scenario keeps its error, and the mode is always a real execution mode", () => {
    const r: any = createScenarioResultArtifact({
      scenarioName: "boom",
      status: "failed",
      networkId: "simnet",
      mode: scenarioModeForNetwork("simnet"),
      error: { code: "X", message: "y", component: "scenario", recoverable: false }
    });
    expect(r.mode).toBe("localnet");
    expect(verifyArtifactIntegritySync(structuredClone(r), { strict: true }).ok).toBe(true);
    expect(scenarioModeForNetwork(undefined)).toBe("simulator");
    expect(scenarioModeForNetwork("testnet-10")).toBe("rpc");
  });

  it("the pre-fix shape (no hashVersion, mode \"agent\") is still rejected — the verifier was right", () => {
    const legacy = {
      schema: "hardkas.scenarioResult.v1",
      hardkasVersion: "0.12.0-rc.27",
      version: "1.0.0-alpha",
      networkId: "simulated",
      mode: "agent",
      createdAt: "2026-09-26T00:00:00.000Z",
      scenarioName: "payment flow",
      status: "passed",
      artifactsGenerated: [],
      claims: { mainnet: false, testnet: false, production: false }
    };
    expect(verifyArtifactIntegritySync(legacy, { strict: true }).ok).toBe(false);
  });
});

describe("First contact · E07 · `hardkas silver compile` records verify under HardKAS's own verifier", () => {
  it("the record the published rc.23 CLI wrote verifies strictly (FULL)", () => {
    const record = publishedSilverRecord();
    expect(record.schema).toBe("hardkas.silverCompile.v1");
    expect(record.hashVersion).toBe(5);
    expect(record.artifactId).toBeUndefined();
    const v = verifyArtifactIntegritySync(record, { strict: true });
    expect(v.issues.filter((i: any) => i.severity !== "warning")).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.authScope).toBe("FULL");
  });

  it("making artifactId optional does not let a v5 record carry one (FORBIDDEN_IDENTITY_FIELD)", () => {
    const record = publishedSilverRecord();
    record.artifactId = record.contentHash;
    record.contentHash = calculateContentHash(record, CURRENT_HASH_VERSION);
    const v = verifyArtifactIntegritySync(record, { strict: true });
    expect(v.ok).toBe(false);
    expect(v.issues.map((i: any) => i.code)).toContain("FORBIDDEN_IDENTITY_FIELD");
  });

  it("a tampered record is still detected", () => {
    const record = publishedSilverRecord();
    record.contracts[0].address = "kaspasim:" + "q".repeat(61);
    expect(verifyArtifactIntegritySync(record, { strict: true }).ok).toBe(false);
  });
});
