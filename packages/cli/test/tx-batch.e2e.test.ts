import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas tx batch", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "npx";
  const runArgs = ["tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tx-batch-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should process a batch of transactions sequentially", async () => {
    const payments = [
      { from: "alice", to: "bob", amount: "1.0" },
      { from: "alice", to: "carol", amount: "0.5" }
    ];
    const file = path.join(tmpDir, "payments.json");
    await fs.writeFile(file, JSON.stringify(payments), "utf-8");

    const { stdout } = await execa(tsx, [...runArgs, "tx", "batch", "--file", file, "--json"]);
    const result = JSON.parse(stdout);

    expect(result.batchSize).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(0);
    expect(result.results.length).toBe(2);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(true);
  }, 30000);
});
