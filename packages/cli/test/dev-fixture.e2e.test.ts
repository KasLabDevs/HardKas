import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas dev fixture generate", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "npx";
  const runArgs = ["tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-fixture-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should generate a mock fixture for payroll", async () => {
    const outPath = path.join(tmpDir, "payroll.json");
    await execa(tsx, [...runArgs, "dev", "fixture", "generate", "--type", "payroll", "--out", outPath, "--json"]);
    
    const content = await fs.readFile(outPath, "utf-8");
    const payload = JSON.parse(content);

    expect(payload._is_fixture).toBe(true);
    expect(payload.type).toBe("payroll");
    expect(payload.securityModel).toBe("mock-fixture");
    expect(payload.mode).toBe("simulated");
    expect(payload.items.length).toBe(5);
  }, 30000);

  it("should fail for invalid type", async () => {
    await expect(
      execa(tsx, [...runArgs, "dev", "fixture", "generate", "--type", "invalid-type", "--json"])
    ).rejects.toThrow(/Invalid fixture type: invalid-type/);
  }, 30000);
});
