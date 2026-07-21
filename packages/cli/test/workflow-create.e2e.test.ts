import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas workflow create", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  const runArgs = ["--import", "tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-create-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should return COMMAND_QUARANTINED for basic template", async () => {
    const outPath = path.join(tmpDir, "wf-basic.json");

    const { stdout } = await execa(tsx, [
      ...runArgs,
      "workflow",
      "create",
      "test-flow",
      "--template",
      "basic",
      "--out",
      outPath,
      "--json"
    ], { reject: false });

    const wf = JSON.parse(stdout);
    expect(wf.ok).toBe(false);
    expect(wf.code).toBe("COMMAND_QUARANTINED");
  }, 180000);

  it("should return COMMAND_QUARANTINED for invalid template", async () => {
    const { stdout } = await execa(tsx, [
      ...runArgs,
      "workflow",
      "create",
      "test-flow",
      "--template",
      "invalid-template",
      "--json"
    ], { reject: false });

    expect(JSON.parse(stdout).code).toBe("COMMAND_QUARANTINED");
  }, 180000);
});
