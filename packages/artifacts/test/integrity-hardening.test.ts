import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  verifyArtifactIntegrity,
  calculateContentHash,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION
} from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Artifact Integrity Hardening (P1.1)", () => {
  const testDir = path.join(os.tmpdir(), `hardkas-test-${Date.now()}`);

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  const createValidArtifact = () => ({
    schema: "hardkas.txPlan",
    hardkasVersion: "0.12.0-rc.23",
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date().toISOString(),
    networkId: "simnet",
    mode: "simulator",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    from: { address: "kaspa:sim_alice" },
    to: { address: "kaspa:sim_bob" },
    amountSompi: "1000",
    estimatedFeeSompi: "1",
    estimatedMass: "100",
    inputs: [],
    outputs: [{ address: "kaspa:sim_bob", amountSompi: "1000" }]
  });

  // Wave 1.1 · IC-1′.1c / IC-4′.5: planId is a derived label outside the hash and the
  // verifier recomputes it, so a fixture seals its identity the way a producer does.
  const sealPlan = (artifact: any) => {
    artifact.contentHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
    artifact.planId = `plan-${artifact.contentHash.slice(0, 16)}`;
    return artifact;
  };

  it("should verify a valid artifact object", async () => {
    const artifact: any = createValidArtifact();
    sealPlan(artifact);

    const result = await verifyArtifactIntegrity(artifact);
    expect(result.ok).toBe(true);
  });

  it("should detect content manipulation", async () => {
    const artifact: any = createValidArtifact();
    sealPlan(artifact);

    // Mutate amount
    artifact.amountSompi = "9999";

    const result = await verifyArtifactIntegrity(artifact);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Hash mismatch");
  });

  it("should fail if contentHash is missing", async () => {
    const artifact = createValidArtifact();

    const result = await verifyArtifactIntegrity(artifact);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Missing contentHash");
  });

  it("should reject incompatible major versions", async () => {
    const artifact: any = createValidArtifact();
    artifact.version = "3.0.0"; // Future incompatible version
    sealPlan(artifact);

    const result = await verifyArtifactIntegrity(artifact);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Incompatible version");
  });

  it("should be independent of CRLF/LF line endings in file", async () => {
    const artifact: any = createValidArtifact();
    sealPlan(artifact);
    const json = JSON.stringify(artifact, null, 2);

    const lfPath = path.join(testDir, "lf.json");
    const crlfPath = path.join(testDir, "crlf.json");

    fs.writeFileSync(lfPath, json.replace(/\r\n/g, "\n"));
    fs.writeFileSync(crlfPath, json.replace(/\n/g, "\r\n"));

    const resLF = await verifyArtifactIntegrity(lfPath);
    const resCRLF = await verifyArtifactIntegrity(crlfPath);

    expect(resLF.ok).toBe(true);
    expect(resCRLF.ok).toBe(true);
    expect(resLF.actualHash).toBe(resCRLF.actualHash);
  });

  it("should ignore filesystem path metadata", async () => {
    const artifact: any = createValidArtifact();
    sealPlan(artifact);

    const pathA = path.join(testDir, "artifact_a.json");
    const subDir = path.join(testDir, "sub");
    fs.mkdirSync(subDir);
    const pathB = path.join(subDir, "moved.json");

    fs.writeFileSync(pathA, JSON.stringify(artifact));
    fs.writeFileSync(pathB, JSON.stringify(artifact));

    const resA = await verifyArtifactIntegrity(pathA);
    const resB = await verifyArtifactIntegrity(pathB);

    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);
    expect(resA.actualHash).toBe(resB.actualHash);
  });
});
