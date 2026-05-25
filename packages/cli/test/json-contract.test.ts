import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("CLI JSON Contract", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-json-"));
    const cmd = path.resolve(__dirname, "../src/index.ts");
    await execa("npx", ["tsx", cmd, "init"], { cwd: tmpDir });
  }, 30000);

  afterEach(async () => {
    // maxRetries handles Windows EBUSY when tsx child process still holds a handle
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }, 15000);

  const runCli = async (args: string[]) => {
    const cmd = path.resolve(__dirname, "../src/index.ts");
    // Run via tsx to avoid build steps in dev tests
    return execa("npx", ["tsx", cmd, ...args], { cwd: tmpDir });
  };

  it("tx plan --json produces strict parsable JSON with no stdout pollution", async () => {
    await runCli(["accounts", "fund", "alice", "--amount", "1000"]);
    const { stdout, stderr } = await runCli([
      "tx", "plan",
      "--from", "alice",
      "--to", "bob",
      "--amount", "10",
      "--network", "simulated",
      "--json"
    ]);

    // stdout should ONLY be valid JSON
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: any) {
      throw new Error(`Failed to parse stdout as JSON: ${err.message}\nStdout was:\n${stdout}`);
    }

    expect(parsed.schema).toBe("hardkas.txPlan");
    expect(parsed.networkId).toBe("simulated");

    // All human logs (like "TxPlan generated") should be redirected or suppressed.
    // If they were output, they would either fail the JSON.parse or be in stderr.
  }, 30000);

  it("doctor --json produces strict parsable JSON with no stdout pollution", async () => {
    const { stdout } = await runCli(["doctor", "--json"]);

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: any) {
      throw new Error(`Failed to parse stdout as JSON: ${err.message}\nStdout was:\n${stdout}`);
    }

    expect(parsed.summary).toBeDefined();
    expect(parsed.checks).toBeDefined();
    expect(Array.isArray(parsed.checks)).toBe(true);
  }, 30000);

});
