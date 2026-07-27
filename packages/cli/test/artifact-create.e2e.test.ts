import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas artifact create", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  const runArgs = ["--import", "tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-create-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should create an artifact deterministically from input JSON", { timeout: 180000 }, async () => {
    const payloadPath = path.join(tmpDir, "payload.json");
    // Ensure keys are out of order to test canonicalization implicitly if hash is stable
    await fs.writeFile(
      payloadPath,
      JSON.stringify({ key: "value", b: 2, a: 1 }),
      "utf-8"
    );

    const outPath1 = path.join(tmpDir, "out1.json");
    const outPath2 = path.join(tmpDir, "out2.json");

    await execa(tsx, [
      ...runArgs,
      "artifact",
      "create",
      "test-type",
      "--input",
      payloadPath,
      "--out",
      outPath1,
      "--json"
    ]);

    // Simulate delay for timestamp change
    await new Promise((r) => setTimeout(r, 10));

    await execa(tsx, [
      ...runArgs,
      "artifact",
      "create",
      "test-type",
      "--input",
      payloadPath,
      "--out",
      outPath2,
      "--json"
    ]);

    const out1 = JSON.parse(await fs.readFile(outPath1, "utf-8"));
    const out2 = JSON.parse(await fs.readFile(outPath2, "utf-8"));

    expect(out1.contentHash).toBeDefined();
    expect(out1.contentHash).toBe(out2.contentHash);
    expect(out1.type).toBe("test-type");
    expect(out1.payload.key).toBe("value");
  }, 180000);
});
