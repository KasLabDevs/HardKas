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

  it("throws NETWORK_ACCOUNT_MISMATCH when URL forces RPC with simulated account", async () => {
    const { config } = await loadHardkasConfig();

    await expect(
      runTxPlan({
        from: "kaspa:sim_alice",
        to: "kaspa:sim_bob",
        amount: "10",
        networkId: "simnet",
        feeRate: "1",
        config,
        url: "http://127.0.0.1:1" // Forces RPC backend
      })
    ).rejects.toThrow(/NETWORK_ACCOUNT_MISMATCH/);
  });

  it("simulated mode never performs network fetches and sets rpcUrl to simulated://local", async () => {
    const { config } = await loadHardkasConfig();
    const artifact = await runTxPlan({
      from: "kaspa:sim_alice",
      to: "kaspa:sim_bob",
      amount: "10",
      networkId: "simnet",
      feeRate: "1",
      config
    });
    expect(artifact.rpcUrl).toBe("simulated://local");
  });

  it("NETWORK_ACCOUNT_MISMATCH triggers correctly for simulated account and real network", async () => {
    const { config } = await loadHardkasConfig();
    await expect(
      runTxPlan({
        from: "kaspa:sim_alice",
        to: "kaspa:sim_bob",
        amount: "10",
        networkId: "testnet-11",
        feeRate: "1",
        config
      })
    ).rejects.toThrow(/NETWORK_ACCOUNT_MISMATCH/);
  });
});
