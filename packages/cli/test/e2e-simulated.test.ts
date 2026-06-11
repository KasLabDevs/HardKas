import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import {
  resetLocalnetState,
  loadLocalnetState,
  getDefaultLocalnetStatePath,
  listSimulatedReceipts
} from "@hardkas/localnet";
import { runTxFlow } from "../src/runners/tx-flow.js";
import { HardkasConfig } from "@hardkas/config";
import * as artifacts from "@hardkas/artifacts";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("E2E Simulated Happy Path", () => {
  let tmpDir: string;

  const mockConfig: HardkasConfig = {
    defaultNetwork: "simulated",
    networks: {
      simulated: { kind: "simulated" }
    }
  };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "e2e-sim-test-"));
    (mockConfig as any).cwd = tmpDir;
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

  beforeEach(async () => {
    // For now, let's just use the real resetLocalnetState.
    await resetLocalnetState({ cwd: tmpDir });
  });

  it("should complete a full plan -> sign -> send flow", async () => {
    // 1. Initial balance should be 0 or from faucet
    await resetLocalnetState({ cwd: tmpDir, initialBalanceSompi: 100_000_000_000n }); // 1000 KAS

    // 2. Run Tx Flow
    const result = await runTxFlow({
      from: "alice",
      to: "bob",
      amount: "10",
      feeRate: "1",
      config: mockConfig,
      send: true,
      yes: true,
      network: "simulated",
      workspaceRoot: tmpDir
    });

    if (!result.ok) {
      console.error("E2E Failed in plan:", result.steps.plan.error);
      console.error("E2E Failed in sign:", result.steps.sign.error);
      console.error("E2E Failed in send:", result.steps.send.error);
    }

    expect(result.ok).toBe(true);
    expect(result.result).toBe("broadcast");
    expect(result.steps.send.status).toBe("ok");

    const txId = (result.steps.send.artifact as any)?.txId;
    expect(txId).toBeDefined();

    // 3. Verify state changed
    const state = await loadLocalnetState(getDefaultLocalnetStatePath(tmpDir));
    expect(state).not.toBeNull();
    // Alice had 1000 KAS, sent 10 KAS + fee
    // DAA score should be 1
    expect(state?.daaScore).toBe("1");

    // 4. Verify receipt exists
    const receipts = await listSimulatedReceipts({ cwd: tmpDir });
    const myReceipt = receipts.find((r: any) => r.txId === txId);
    expect(myReceipt).toBeDefined();
    expect(myReceipt.schema).toBe(artifacts.ARTIFACT_SCHEMAS.TX_RECEIPT);
  }, 60000);

  it("should fail if insufficient funds", async () => {
    // Reset with 0 balance
    await resetLocalnetState({ cwd: tmpDir, initialBalanceSompi: 0n });

    const result = await runTxFlow({
      from: "alice",
      to: "bob",
      amount: "10",
      feeRate: "1",
      config: mockConfig,
      send: true,
      yes: true,
      network: "simulated",
      workspaceRoot: tmpDir
    });

    expect(result.ok).toBe(false);
    expect(result.steps.plan.status).toBe("error");
    expect(result.steps.plan.error).toContain("Insufficient funds");
  });
});
