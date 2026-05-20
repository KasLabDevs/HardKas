import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { loadHardkasConfig } from "@hardkas/config";
import path from "node:path";
import fs from "node:fs";

describe("Simulated Isolation", () => {
  const originalCwd = process.cwd();
  const tempDir = path.resolve(originalCwd, ".tmp/simulated-isolation-test");

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    process.chdir(tempDir);
  });

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  it("must succeed even if an unreachable RPC URL is provided", async () => {
    const { config } = await loadHardkasConfig();
    
    // We provide a bogus URL that would normally timeout or fail.
    // However, because networkId is simnet, the simulated backend must not even attempt to connect to it.
    const artifact = await runTxPlan({
      from: "alice",
      to: "bob",
      amount: "10",
      networkId: "simnet",
      feeRate: "1",
      config,
      url: "http://127.0.0.1:1" // Unreachable port
    });

    expect(artifact).toBeDefined();
    expect(artifact.networkId).toBe("simnet");
    expect(artifact.mode).toBe("simulated");
    expect(artifact.from.address).toContain("kaspa:sim_");
    expect(artifact.rpcUrl).toBe("simulated://local"); // It ignores the provided URL
  });
});
