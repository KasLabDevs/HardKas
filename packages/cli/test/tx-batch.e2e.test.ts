import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas tx batch", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  const runArgs = ["--import", "tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tx-batch-test-"));
    // Write dummy config so loadHardkasConfig resolves to tmpDir hermetically
    const configContent = `
import { defineHardkasConfig } from "@hardkas/sdk";
export default defineHardkasConfig({
  defaultNetwork: "simulated",
  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation"
    }
  }
});
`;
    await fs.writeFile(path.join(tmpDir, "hardkas.config.ts"), configContent, "utf-8");
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

    // Execute with process.cwd() (default) so `--import tsx` is resolved, and pass `--workspace tmpDir`
    const { stdout } = await execa(tsx, [
      ...runArgs,
      "tx",
      "batch",
      "--file",
      file,
      "--workspace",
      tmpDir,
      "--json"
    ]);
    const result = JSON.parse(stdout);

    if (result.successCount !== 2) {
      console.error("Batch failed. Results:", JSON.stringify(result.results, null, 2));
    }
    expect(result.batchSize).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(0);
    expect(result.results.length).toBe(2);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(true);
  }, 90000);
});
