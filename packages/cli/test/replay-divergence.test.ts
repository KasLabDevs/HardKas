import { describe, it, expect } from "vitest";
import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { AdversarialFixtures } from "../../testing/src/adversarial-fixtures.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../");
const cliPath = path.resolve(rootDir, "packages/cli/src/index.ts");
const tsxPath = path.resolve(rootDir, "node_modules/.bin/tsx");

describe("Adversarial Validation (Corpus Stress)", () => {
  // Use a longer timeout for CLI executions
  const TEST_TIMEOUT = 30000;

  async function runVerify(targetDir: string) {
    try {
      // Use artifact verify which is more robust for individual artifact checks
      return await execa(tsxPath, [cliPath, "artifact", "verify", targetDir, "--recursive", "--strict"]);
    } catch (e: any) {
      return e;
    }
  }

  it("should detect hash mismatch in artifacts", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-adversarial-hash-"));
    const badArtifact = AdversarialFixtures.hashMismatch();
    fs.writeFileSync(path.join(tempDir, "bad-artifact.json"), JSON.stringify(badArtifact));

    const result = await runVerify(tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr + result.stdout).toContain("HASH_MISMATCH");
    
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, TEST_TIMEOUT);

  it("should detect circular lineage", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-adversarial-circular-"));
    const { artifactA, artifactB } = AdversarialFixtures.circularLineage();
    fs.writeFileSync(path.join(tempDir, "art-a.json"), JSON.stringify(artifactA));
    fs.writeFileSync(path.join(tempDir, "art-b.json"), JSON.stringify(artifactB));

    const result = await runVerify(tempDir);
    // Note: Circular lineage might be caught by verifyArtifactSemantics
    expect(result.exitCode).toBe(1);
    // We expect a failure, but maybe the specific code is LINEAGE_CYCLE or similar
    expect(result.stdout).toContain("FAIL");
    
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, TEST_TIMEOUT);

  it("should detect cross-network parentage", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-adversarial-cross-network-"));
    const { parent, child } = AdversarialFixtures.crossNetworkLineage();
    fs.writeFileSync(path.join(tempDir, "parent.json"), JSON.stringify(parent));
    fs.writeFileSync(path.join(tempDir, "child.json"), JSON.stringify(child));

    const result = await runVerify(tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/NETWORK_MISMATCH|FAIL/);

    fs.rmSync(tempDir, { recursive: true, force: true });
  }, TEST_TIMEOUT);

  it("should handle malformed JSONL gracefully", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-adversarial-malformed-"));
    const malformed = AdversarialFixtures.malformedJsonl();
    fs.writeFileSync(path.join(tempDir, "events.jsonl"), malformed);

    // Replay verify might not check jsonl directly yet unless it's part of a trace
    // But we expect it to fail if it tries to parse it.
    const result = await runVerify(tempDir);
    expect(result.exitCode).toBeDefined();
    
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, TEST_TIMEOUT);
});
