import { describe, it, expect, beforeEach } from "vitest";
import { 
  resetLocalnetState, 
  loadLocalnetState,
  getDefaultLocalnetStatePath,
  listSimulatedReceipts
} from "@hardkas/localnet";
import { runTxFlow } from "../src/runners/tx-flow";
import { HardkasConfig } from "@hardkas/config";
import * as artifacts from "@hardkas/artifacts";
import fs from "node:fs";
import path from "node:path";

describe("E2E Simulated Happy Path", () => {
  const tempDir = path.join(process.cwd(), ".hardkas-test-e2e");
  
  const mockConfig: HardkasConfig = {
    defaultNetwork: "simulated",
    networks: {
      simulated: { kind: "simulated" }
    },
    accounts: {
      alice: { kind: "simulated", address: "kaspasim:alice" },
      bob: { kind: "simulated", address: "kaspasim:bob" }
    }
  };

  beforeEach(async () => {
    // Ensure we start clean
    const receiptsDir = path.join(process.cwd(), ".hardkas", "receipts");
    const tracesDir = path.join(process.cwd(), ".hardkas", "traces");
    if (fs.existsSync(receiptsDir)) fs.rmSync(receiptsDir, { recursive: true });
    if (fs.existsSync(tracesDir)) fs.rmSync(tracesDir, { recursive: true });
    
    // For now, let's just use the real resetLocalnetState.
    await resetLocalnetState();
  });

  it("should complete a full plan -> sign -> send flow", async () => {
    // 1. Initial balance should be 0 or from faucet
    // We don't have a faucet runner yet, but we can simulate it by resetting with initial balance
    await resetLocalnetState({ initialBalanceSompi: 100_000_000_000n }); // 1000 KAS

    // 2. Run Tx Flow
    const result = await runTxFlow({
      from: "alice",
      to: "bob",
      amount: "10",
      feeRate: "1",
      config: mockConfig,
      send: true,
      yes: true,
      network: "simulated"
    });

    expect(result.ok).toBe(true);
    expect(result.result).toBe("broadcast");
    expect(result.steps.send.status).toBe("ok");
    
    const txId = (result.steps.send.artifact as any)?.txId;
    expect(txId).toBeDefined();

    // 3. Verify state changed
    const state = await loadLocalnetState();
    expect(state).not.toBeNull();
    // Alice had 1000 KAS, sent 10 KAS + fee
    // DAA score should be 1
    expect(state?.daaScore).toBe("1");

    // 4. Verify receipt exists
    const receipts = await listSimulatedReceipts();
    expect(receipts.length).toBe(1);
    expect(receipts[0].txId).toBe(txId);
    expect(receipts[0].schema).toBe(artifacts.ARTIFACT_SCHEMAS.TX_RECEIPT);
  });

  it("should fail if insufficient funds", async () => {
    // Reset with 0 balance
    await resetLocalnetState({ initialBalanceSompi: 0n });

    const result = await runTxFlow({
      from: "alice",
      to: "bob",
      amount: "10",
      feeRate: "1",
      config: mockConfig,
      send: true,
      yes: true,
      network: "simulated"
    });

    expect(result.ok).toBe(false);
    expect(result.steps.plan.status).toBe("error");
    expect(result.steps.plan.error).toContain("Insufficient funds");
  });
});
