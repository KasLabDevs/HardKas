import { describe, it, expect } from "vitest";
import { verifyArtifactIntegrity, verifyArtifactSemantics } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";

const corruptedDir = path.resolve(__dirname, "fixtures/corrupted");

describe("Corruption Corpus Hardening", () => {
  
  it("should reject fee-mismatch.json in strict mode", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "fee-mismatch.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "ECONOMIC_VIOLATION")).toBe(true);
  });

  it("should reject broken-content-hash.json", async () => {
    const fixturePath = path.join(corruptedDir, "broken-content-hash.json");
    const result = await verifyArtifactIntegrity(fixturePath);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "HASH_MISMATCH")).toBe(true);
  });

  it("should reject mutated semantic field", async () => {
    const fixturePath = path.join(corruptedDir, "mutated-signed-field.json");
    const result = await verifyArtifactIntegrity(fixturePath);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "HASH_MISMATCH")).toBe(true);
  });

  it("should reject network/address mismatch", () => {
    const content = fs.readFileSync(path.join(corruptedDir, "network-mismatch.json"), "utf8");
    const artifact = JSON.parse(content);
    const result = verifyArtifactSemantics(artifact, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "NETWORK_ADDRESS_MISMATCH")).toBe(true);
  });

  it("should detect lineage corruption (ID mismatch) when parent provided", () => {
    const parent = {
      schema: "hardkas.snapshot",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "parent-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 10 }
    };
    const child = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "child-hash", lineageId: "flow-wrong", rootArtifactId: "root-hash", parentArtifactId: "parent-hash", sequence: 11 }
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "LINEAGE_ID_MISMATCH")).toBe(true);
  });

  it("should detect parent artifactId mismatch", () => {
    const parent = {
      schema: "hardkas.snapshot",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "parent-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 10 }
    };
    const child = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "child-hash", lineageId: "flow-1", rootArtifactId: "root-hash", parentArtifactId: "wrong-parent-hash", sequence: 11 }
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "PARENT_ID_MISMATCH")).toBe(true);
  });

  it("should detect missing parentArtifactId reference when parent provided", () => {
    const parent = {
      schema: "hardkas.snapshot",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "parent-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 10 }
    };
    const child = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "child-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 11 }
      // parentArtifactId is missing
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "MISSING_PARENT_ID")).toBe(true);
  });

  it("should detect network contamination between parent and child", () => {
    const parent = {
      schema: "hardkas.snapshot",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "parent-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 10 }
    };
    const child = {
      schema: "hardkas.txPlan",
      networkId: "mainnet", // Contamination!
      mode: "simulated",
      lineage: { artifactId: "child-hash", lineageId: "flow-1", rootArtifactId: "root-hash", parentArtifactId: "parent-hash", sequence: 11 }
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "NETWORK_MISMATCH")).toBe(true);
  });

  it("should detect mode contamination between parent and child", () => {
    const parent = {
      schema: "hardkas.snapshot",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "parent-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 10 }
    };
    const child = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      mode: "real", // Contamination!
      lineage: { artifactId: "child-hash", lineageId: "flow-1", rootArtifactId: "root-hash", parentArtifactId: "parent-hash", sequence: 11 }
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "MODE_MISMATCH")).toBe(true);
  });

  it("should detect self-parenting", () => {
    const parent = {
      schema: "hardkas.snapshot",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "same-hash", lineageId: "flow-1", rootArtifactId: "root-hash", sequence: 10 }
    };
    const child = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: "same-hash", lineageId: "flow-1", rootArtifactId: "root-hash", parentArtifactId: "same-hash", sequence: 11 }
    };

    const result = verifyArtifactSemantics(child, { parent });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "SELF_PARENT")).toBe(true);
  });

  describe("Structural Corruption", () => {
    const structuralDir = path.join(corruptedDir, "structural");
    
    it("should reject truncated JSON", async () => {
      const p = path.join(structuralDir, "truncated.json");
      if (!fs.existsSync(structuralDir)) fs.mkdirSync(structuralDir, { recursive: true });
      fs.writeFileSync(p, '{"schema": "hardkas.txPlan", "version": "1.0.0"'); // Truncated
      
      const result = await verifyArtifactIntegrity(p);
      expect(result.ok).toBe(false);
      expect(result.issues.some(i => i.code === "PARSE_ERROR")).toBe(true);
    });

    it("should reject invalid JSON", async () => {
      const p = path.join(structuralDir, "invalid.json");
      fs.writeFileSync(p, 'not json at all');
      
      const result = await verifyArtifactIntegrity(p);
      expect(result.ok).toBe(false);
      expect(result.issues.some(i => i.code === "PARSE_ERROR")).toBe(true);
    });

    it("should reject missing schema", async () => {
      const p = path.join(structuralDir, "missing-schema.json");
      fs.writeFileSync(p, '{"version": "1.0.0", "something": "else"}');
      
      const result = await verifyArtifactIntegrity(p);
      expect(result.ok).toBe(false);
      expect(result.issues.some(i => i.code === "SCHEMA_MISMATCH" || i.code === "INVALID_STRUCTURE")).toBe(true);
    });
  });
});
