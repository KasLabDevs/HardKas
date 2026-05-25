import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Workspace Boundary Isolation", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create a physical temporary directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-workspace-test-"));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    // Ensure we are back where we started, just in case
    process.chdir(originalCwd);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should securely isolate SDK paths to the injected workspaceRoot without touching process.cwd()", async () => {
    // We intentionally stay in the original CWD to prove the SDK doesn't use it
    const sdk = await Hardkas.open({ cwd: tmpDir });

    // 1. Verify basic paths point to tmpDir, NOT process.cwd()
    expect(sdk.workspace.root).toBe(path.resolve(tmpDir));
    expect(sdk.workspace.hardkasDir).toBe(path.join(path.resolve(tmpDir), ".hardkas"));
    expect(sdk.workspace.artifactsDir).toBe(path.join(path.resolve(tmpDir), ".hardkas", "artifacts"));
    expect(sdk.workspace.keystoreDir).toBe(path.join(path.resolve(tmpDir), ".hardkas", "keystore"));

    // 2. Verify relative resolution
    const resolved = sdk.workspace.resolvePath("some", "nested", "file.json");
    expect(resolved).toBe(path.join(path.resolve(tmpDir), "some", "nested", "file.json"));

    // 3. Verify Artifacts I/O creates files in the isolated tmp workspace
    const dummyArtifact = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      contentHash: "hash123",
      timestamp: new Date().toISOString()
    };

    const result = await sdk.artifacts.write(dummyArtifact as any);
    
    // Assert physical file exists in tmpDir
    expect(result.dryRun).toBe(false);
    expect(result.absolutePath).toBeDefined();
    expect(result.absolutePath?.startsWith(path.resolve(tmpDir))).toBe(true);
    expect(fs.existsSync(result.absolutePath!)).toBe(true);

    // 4. Assert NOTHING leaked to process.cwd()
    const leakCheckPath = path.join(process.cwd(), ".hardkas", "artifacts", "tx-plan-hash123.json");
    if (process.cwd() !== tmpDir) {
      expect(fs.existsSync(leakCheckPath)).toBe(false);
    }
  });

  it("should strictly respect dryRun without mutating any filesystem", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir });

    const dummyArtifact = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      contentHash: "hash-dry-run",
      timestamp: new Date().toISOString()
    };

    const result = await sdk.artifacts.write(dummyArtifact as any, { dryRun: true });
    
    expect(result.dryRun).toBe(true);
    expect(result.absolutePath).toBeUndefined();
    
    // Hardkas dir shouldn't even exist since we didn't write anything
    expect(fs.existsSync(sdk.workspace.artifactsDir)).toBe(false);
  });
});
