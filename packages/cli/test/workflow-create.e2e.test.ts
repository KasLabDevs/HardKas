import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas workflow create", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "npx";
  const runArgs = ["tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-create-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should create a workflow from a template offline", async () => {
    const outPath = path.join(tmpDir, "wf-basic.json");
    
    // Test basic template
    await execa(tsx, [...runArgs, "workflow", "create", "test-flow", "--template", "basic", "--out", outPath, "--json"]);
    
    const wf = JSON.parse(await fs.readFile(outPath, "utf-8"));

    expect(wf.workflowId).toMatch(/^wf_test-flow_/);
    expect(wf.name).toBe("test-flow");
    expect(wf.version).toBe("1.0.0-offline");
    expect(wf.steps).toEqual([{ id: "step1", action: "noop" }]);
  }, 30000);

  it("should fail for invalid template", async () => {
    await expect(
      execa(tsx, [...runArgs, "workflow", "create", "test-flow", "--template", "invalid-template", "--json"])
    ).rejects.toThrow(/Template 'invalid-template' not found/);
  }, 30000);
});
