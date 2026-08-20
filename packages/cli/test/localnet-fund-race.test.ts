import { describe, it, expect, beforeAll } from "vitest";
import { runLocalnetFund } from "../src/runners/localnet-runners";
import { runTxPlan } from "../src/runners/tx-plan-runner";
import { loadHardkasConfig } from "@hardkas/config";
import { signTransactionPlan } from "@hardkas/tx-builder";
import { runTxSend } from "../src/runners/tx-send-runner";
import { resolveHardkasAccountAddress } from "@hardkas/accounts";
import * as fs from "fs";
import * as path from "path";

describe("Localnet Fund Race Condition", () => {
  it("should be able to immediately plan, sign and send after fund", async () => {
    const { config } = await loadHardkasConfig();
    
    // We assume the dev-server and simnet node are running, like in the other tests
    const accountName = "alice"; 
    const address = await resolveHardkasAccountAddress(accountName, config);
    
    // 1. fund alice
    console.log("Funding alice...");
    await runLocalnetFund({
      identifier: accountName,
      amountSompi: 100000000000n, // 100 KAS
      timeoutMs: 300000,
      json: false,
      keepMiner: false
    });

    console.log("Planning transaction...");
    // 2. plan
    const planArtifact = await runTxPlan({
      from: accountName,
      to: accountName,
      amount: "1", // 1 KAS
      networkId: "simnet",
      targetName: "localnet",
      feeRate: "300",
      config
    });
    
    console.log("Signing transaction...");
    // 3. sign
    // Let's create a temporary signed artifact path or just sign it programmatically
    const signedArtifactPath = path.join(process.cwd(), ".hardkas", "artifacts", "test-signed-race.json");
    
    // Using CLI runner logic to sign
    // We can call signTransactionPlan from tx-builder
    // But since we are testing the E2E race condition, we can just do the internal steps
    // Actually, let's just use the CLI logic
    const { runTxSign } = await import("../src/runners/tx-sign-runner");
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.create({ cwd: process.cwd(), network: "simnet" });

    // Save plan to disk so `verify` can load it
    await sdk.artifacts.write(planArtifact as any);

    const signedArtifact = await runTxSign({
      planArtifact,
      accountName,
      config
    });
    
    // Save signed to disk
    await sdk.artifacts.write(signedArtifact as any);

    // 4. send
    const txReceipt = await runTxSend({
      targetName: "localnet",
      signedArtifact,
      network: "simnet",
      config
    });

    expect(txReceipt).toBeDefined();
    expect(txReceipt.txId).toBeDefined();
    console.log("Transaction successfully sent:", txReceipt.txId);
  }, 300000);
});
