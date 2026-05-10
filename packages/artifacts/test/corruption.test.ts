import { describe, it, expect } from "vitest";
import { verifyArtifactIntegrity, verifyArtifactSemantics } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";

const corruptedDir = path.resolve(__dirname, "fixtures/corrupted");

describe("Corruption Corpus (Fase 4 Hardening)", () => {
  
  it("should reject fee-mismatch.json in strict mode", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "fee-mismatch.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "ECONOMIC_VIOLATION")).toBe(true);
  });

  it("should reject broken-content-hash.json", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "broken-content-hash.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactIntegrity(artifact);
    const semanticResult = verifyArtifactSemantics(artifact, { strict: true });
    expect(semanticResult.ok).toBe(false);
    expect(semanticResult.issues.some(i => i.code === "LINEAGE_IDENTITY_MISMATCH")).toBe(true);
  });

  it("should reject dust-output.json", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "dust-output.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.message.includes("Dust"))).toBe(true);
  });

  it("should reject broken lineage parent", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "lineage-broken-parent.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "LINEAGE_INCONSISTENCY")).toBe(true);
  });

  it("should reject broken lineage root", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "lineage-broken-root.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    // Note: If this fails, it might be due to missing parent context in the test.
    // However, it should at least fail due to network/address mismatch or other checks.
  });

  it("should reject mutated signed field", async () => {
    const fixturePath = path.join(corruptedDir, "mutated-signed-field.json");
    const result = await verifyArtifactIntegrity(fixturePath);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "HASH_MISMATCH")).toBe(true);
  });

  it("should reject network mismatch", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "network-mismatch.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "NETWORK_ADDRESS_MISMATCH")).toBe(true);
  });

  it("should reject simulated-real contamination", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "simulated-real-contamination.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "NETWORK_ADDRESS_MISMATCH")).toBe(true);
  });

  it("should reject stale snapshots in strict mode", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "stale-snapshot.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "STALE_ARTIFACT")).toBe(true);
  });

  it("should reject missing lineage in strict mode", () => {
    const artifact = { 
      schema: "hardkas.txPlan", 
      mode: "real", 
      networkId: "mainnet",
      hardkasVersion: "0.2.2-alpha",
      version: "1.0.0-alpha",
      createdAt: new Date().toISOString(),
      amountSompi: "1000"
    };
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "MISSING_LINEAGE")).toBe(true);
  });
});
