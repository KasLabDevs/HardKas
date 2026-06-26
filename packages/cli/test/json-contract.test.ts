import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("CLI JSON Contract", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-json-"));
    const bin = path.resolve(__dirname, "../dist/index.js");
    await execa("node", [bin, "init"], { cwd: tmpDir });
  }, 30000);

  afterEach(async () => {
    // maxRetries handles Windows EBUSY when tsx child process still holds a handle.
    // If it still fails, ignore it to prevent flakiness in tests.
    try {
      await fs.rm(tmpDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200
      });
    } catch (e: unknown) {
      if (((e as any).code) !== "EBUSY" && ((e as any).code) !== "ENOENT") {
        throw e;
      }
    }
  }, 15000);

  const runCli = async (args: string[], options: any = {}) => {
    const bin = path.resolve(__dirname, "../dist/index.js");
    return execa("node", [bin, ...args], {
      cwd: tmpDir,
      ...options,
      env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", ...options.env }
    });
  };

  it("tx plan --json produces strict parsable JSON with no stdout pollution", async () => {
    await runCli(["accounts", "fund", "alice", "--amount", "1000"]);
    const { stdout, stderr } = await runCli([
      "tx",
      "plan",
      "--from",
      "alice",
      "--to",
      "bob",
      "--amount",
      "10",
      "--network",
      "simulated",
      "--json"
    ]);

    // stdout should ONLY be valid JSON
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse stdout as JSON: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}\nStdout was:\n${stdout}`
      );
    }
    const resultPayload = parsed.result ?? parsed;

    expect(resultPayload.schema).toBe("hardkas.txPlan");
    expect(resultPayload.networkId).toBe("simulated");

    // All human logs (like "TxPlan generated") should be redirected or suppressed.
    // If they were output, they would either fail the JSON.parse or be in stderr.
  }, 30000);

  it("doctor --json produces strict parsable JSON with no stdout pollution", async () => {
    const { stdout } = await runCli(["doctor", "--json"]);

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse stdout as JSON: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}\nStdout was:\n${stdout}`
      );
    }
    const resultPayload = parsed.result ?? parsed;

    expect(resultPayload.summary).toBeDefined();
    expect(resultPayload.checks).toBeDefined();
    expect(Array.isArray(resultPayload.checks)).toBe(true);
  }, 30000);

  it("verify --json produces strict parsable JSON", async () => {
    const goldenPlanPath = path.resolve(
      __dirname,
      "../../artifacts/test/fixtures/golden/tx-plan.valid.json"
    );
    const goldenContent = await fs.readFile(goldenPlanPath, "utf-8");
    const destDir = path.join(tmpDir, ".hardkas", "artifacts");
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, "plan.json"), goldenContent, "utf-8");

    const { stdout } = await runCli(["verify", "--json"]);
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse stdout as JSON: ${((err instanceof Error) ? err.message : String(err))}\nStdout was:\n${stdout}`
      );
    }
    const resultPayload = parsed.result ?? parsed;

    expect(resultPayload.schema).toBe("hardkas.queryVerify.v1");
    expect(parsed.ok).toBe(true);
  }, 30000);

  it("rebuild --json produces strict parsable JSON", async () => {
    // Run rebuild with --from-artifacts
    const { stdout } = await runCli(["rebuild", "--from-artifacts", "--json"]);
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse stdout as JSON: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}\nStdout was:\n${stdout}`
      );
    }
    const resultPayload = parsed.result ?? parsed;

    expect(resultPayload.schema).toBe("hardkas.queryRebuild.v1");
    expect(parsed.ok).toBe(true);
  }, 30000);

  it("capabilities --json produces strict parsable JSON", async () => {
    const { stdout } = await runCli(["capabilities", "--json"], {
      env: { ...process.env, HARDKAS_EXPERIMENTAL: "1" }
    });
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse stdout as JSON: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}\nStdout was:\n${stdout}`
      );
    }
    const resultPayload = parsed.result ?? parsed;

    expect(resultPayload.version).toBeDefined();
    expect(resultPayload.capabilities).toBeDefined();
  }, 30000);
});
