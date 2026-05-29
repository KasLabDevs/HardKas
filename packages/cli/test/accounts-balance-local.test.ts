import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runAccountsBalance } from "../src/runners/accounts-balance-runner.js";
import { loadOrCreateLocalnetState, applySimulatedPayment, saveLocalnetState } from "@hardkas/localnet";
import { systemRuntimeContext } from "@hardkas/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Accounts Balance Local", () => {
  let tmpDir: string;
  let originalCwd = process.cwd();
  let aliceAddress: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-balance-test-"));
    // Change cwd to tmpdir early so loadOrCreateLocalnetState uses it implicitly if needed
    process.chdir(tmpDir);

    const state = await loadOrCreateLocalnetState({ cwd: tmpDir });
    const aliceAccount = state.accounts.find(a => a.name === "alice");
    if (!aliceAccount) throw new Error("Alice account not found in default state");
    aliceAddress = aliceAccount.address;
    
    // Create minimal hardkas config so it defaults to simnet
    fs.writeFileSync(path.join(tmpDir, "hardkas.config.ts"), "export default { defaultNetwork: 'simnet' };");
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should query local balance successfully without hitting RPC", async () => {
    const result = await runAccountsBalance({
      identifier: "alice",
      local: true
    });

    const expectedBalance = 1000n * 100000000n; // 1000 KAS in Sompi
    expect(result.balanceSompi).toBe(expectedBalance);
    expect(result.network).toBe("simulated");
  });
});
