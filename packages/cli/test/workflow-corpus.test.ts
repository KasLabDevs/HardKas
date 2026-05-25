import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { coreEvents } from "@hardkas/core";

describe("Workflow Runtime & Adversarial Defense", () => {
  let tmpDir: string;
  let sdk: Hardkas;
  let strictSdk: Hardkas;
  const corpusDir = path.resolve(__dirname, "../../../examples/workflows");

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-wf-test-"));
    fs.writeFileSync(path.join(tmpDir, "hardkas.config.ts"), `export default { defaultNetwork: "simnet" };`);
    fs.mkdirSync(path.join(tmpDir, ".hardkas", "artifacts"), { recursive: true });
    
    // Create an agent SDK instance allowed to mutate for standard tests
    sdk = await Hardkas.open({ 
      cwd: tmpDir, 
      mode: "agent", 
      policy: { requireDryRun: false, allowNetwork: true, allowMainnet: false } 
    });

    // Create a strict agent SDK instance that strictly enforces dryRun
    strictSdk = await Hardkas.open({ 
      cwd: tmpDir, 
      mode: "agent", 
      policy: { requireDryRun: true, allowNetwork: true, allowExternalWallet: false, allowMainnet: false } 
    });

    // Mock RPC UTXOs
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockResolvedValue([
      { outpoint: { transactionId: "mocktx", index: 0 }, address: "kaspa:sim_qruf...alice", amountSompi: 900000000000000n, isSpendable: true },
      { outpoint: { transactionId: "mocktx", index: 1 }, address: "kaspa:sim_qruf...carol", amountSompi: 900000000000000n, isSpendable: true }
    ] as any);

    vi.spyOn(strictSdk.rpc, "getUtxosByAddress").mockResolvedValue([
      { outpoint: { transactionId: "mocktx", index: 1 }, address: "kaspa:sim_qruf...carol", amountSompi: 900000000000000n, isSpendable: true }
    ] as any);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const loadWorkflow = (name: string) => {
    return JSON.parse(fs.readFileSync(path.join(corpusDir, name), "utf-8"));
  };

  it("should process a clean, declarative simple simulated payment", async () => {
    const def = loadWorkflow("simple-simulated-payment.json");
    
    const wf = await sdk.workflow.run({ steps: def.steps, dryRun: false });
    if (wf.status === "failed") console.log(wf.errorEnvelope);
    
    expect(wf.status).toBe("completed");
    expect(wf.errorEnvelope).toBeUndefined();
    expect(wf.producedArtifacts.length).toBeGreaterThan(0);
    
    // Verify Cryptographic Replay passes
    const replay = await sdk.replay.verify({ workflowId: wf.workflowId });
    if (!replay.passed) console.log("REPLAY ERROR:", replay.error, replay.report);
    expect(replay.passed).toBe(true);
  });

  it("should catch policy violations explicitly: agent attempting mainnet", async () => {
    const def = loadWorkflow("mainnet-policy-violation.json");
    
    const wf = await sdk.workflow.run({ steps: def.steps, dryRun: false });
    
    expect(wf.status).toBe("failed");
    expect(wf.errorEnvelope).toBeDefined();
    expect(wf.errorEnvelope?.code).toBe("POLICY_VIOLATION");
    expect(wf.errorEnvelope?.message).toMatch(/mainnet/);
  });

  it("should catch policy violations explicitly: agent mutating without dryRun", async () => {
    const def = loadWorkflow("dry-run-agent-policy.json");
    
    // The policy violation throws entirely, protecting the system at the deepest level
    await expect(strictSdk.workflow.run({ steps: def.steps, dryRun: false }))
      .rejects.toThrowError(/Agent Mode Policy Violation/);
  });

  it("should successfully orchestrate a multi-step workflow without failing", async () => {
    const def = loadWorkflow("multi-step-payment.json");
    const wf = await sdk.workflow.run({ steps: def.steps, dryRun: false });
    if (wf.status === "failed") console.log(wf.errorEnvelope);
    
    expect(wf.status).toBe("completed");
    expect(wf.steps.length).toBe(4);
    expect(wf.producedArtifacts.length).toBeGreaterThanOrEqual(4);
  });

  it("adversarial: tampering with a produced artifact must instantly fail replay", async () => {
    const def = loadWorkflow("simple-simulated-payment.json");
    const wf = await sdk.workflow.run({ steps: def.steps, dryRun: false });
    
    // Adversary modifies a child artifact directly on disk
    const targetId = wf.producedArtifacts[0];
    const artifactsDir = path.join(tmpDir, ".hardkas", "artifacts");
    const targetFile = fs.readdirSync(artifactsDir).find(f => f.includes(targetId) && f.endsWith(".json"));
    const targetPath = path.join(artifactsDir, targetFile!);
    
    const childStr = fs.readFileSync(targetPath, "utf-8");
    const tampered = childStr.replace(/"amountSompi": "\d+"/, '"amountSompi": "999999999999"');
    fs.writeFileSync(targetPath, tampered);

    // Run replay engine against the workflow lineage
    const replay = await sdk.replay.verify({ workflowId: wf.workflowId });
    
    // MUST FAIL determinism check
    expect(replay.passed).toBe(false);
    expect(replay.determinism).toBe("failed");
    expect(replay.error).toMatch(/failed cryptographic determinism check/);
  });

});
