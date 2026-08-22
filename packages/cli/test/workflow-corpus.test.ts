import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-wf-test-"));
    fs.writeFileSync(
      path.join(tmpDir, "hardkas.config.ts"),
      `export default { defaultNetwork: "simulated" };`
    );
    fs.mkdirSync(path.join(tmpDir, ".hardkas", "artifacts"), { recursive: true });

    const { createInitialLocalnetState } = require("@hardkas/localnet");
    const mockState = createInitialLocalnetState();
    mockState.daaScore = "1000";
    mockState.networkId = "simulated";
    mockState.mode = "simulator";
    // Fund alice and carol heavily
    mockState.utxos.push({
      id: "mocktx:0",
      address: mockState.accounts.find(a => a.name === "alice").address,
      amountSompi: "900000000000000",
      spent: false,
      createdAtDaaScore: "100"
    });
    mockState.utxos.push({
      id: "mocktx:1",
      address: mockState.accounts.find(a => a.name === "carol").address,
      amountSompi: "900000000000000",
      spent: false,
      createdAtDaaScore: "100"
    });
    fs.writeFileSync(
      path.join(tmpDir, ".hardkas", "localnet.json"),
      JSON.stringify(mockState)
    );

    // Create an agent SDK instance allowed to mutate for standard tests
    sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      autoBootstrap: false,
      policy: { requireDryRun: false, allowNetwork: true, allowMainnet: false }
    });

    // Create a strict agent SDK instance that strictly enforces dryRun
    strictSdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      autoBootstrap: false,
      policy: {
        requireDryRun: true,
        allowNetwork: true,
        allowExternalWallet: false,
        allowMainnet: false
      }
    });

    // Mock RPC UTXOs
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (addr: string) => {
      if (addr.includes("alice")) {
        return [
          {
            outpoint: { transactionId: "mocktx", index: 0 },
            address: "kaspa:sim_qruf...alice",
            amountSompi: 900000000000000n,
            isSpendable: true
          }
        ] as any;
      }
      return [
        {
          outpoint: { transactionId: "mocktx", index: 1 },
          address: "kaspa:sim_qruf...carol",
          amountSompi: 900000000000000n,
          isSpendable: true
        }
      ] as any;
    });

    vi.spyOn(strictSdk.rpc, "getUtxosByAddress").mockImplementation(
      async (addr: string) => {
        if (addr.includes("alice")) {
          return [
            {
              outpoint: { transactionId: "mocktx", index: 0 },
              address: "kaspa:sim_qruf...alice",
              amountSompi: 900000000000000n,
              isSpendable: true
            }
          ] as any;
        }
        return [
          {
            outpoint: { transactionId: "mocktx", index: 1 },
            address: "kaspa:sim_qruf...carol",
            amountSompi: 900000000000000n,
            isSpendable: true
          }
        ] as any;
      }
    );

    // Mock RPC submitTransaction to prevent tx.send from timing out
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (req: any) => {
      return { transactionId: "mocktx-receipt-1234" } as any;
    });
    vi.spyOn(strictSdk.rpc, "submitTransaction").mockImplementation(async (req: any) => {
      return { transactionId: "mocktx-receipt-1234" } as any;
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const loadWorkflow = (name: string) => {
    return JSON.parse(fs.readFileSync(path.join(corpusDir, name), "utf-8"));
  };

  it("should process a clean, declarative simple simulated payment", async () => {
    const def = loadWorkflow("simple-simulated-payment.json");
    // Modify to tx.send so it generates a receipt for replay verification
    def.steps.forEach((s: any) => { if (s.type === "tx.simulate") s.type = "tx.send"; });

    const wf = await sdk.experimental.workflow.run({ steps: def.steps, dryRun: false });
    if (wf.status === "failed") console.log(wf.errorEnvelope);

    expect(wf.status).toBe("completed");
    expect(wf.errorEnvelope).toBeUndefined();
    expect(wf.producedArtifacts.length).toBeGreaterThan(0);

    // Verify Cryptographic Replay passes
    const store = new (require("@hardkas/artifacts").ProjectArtifactStore)(tmpDir);
    let receiptId = "";
    for (const id of wf.producedArtifacts) {
      try {
        const art = await store.readArtifact(id);
        if (art.schema === "hardkas.txReceipt") {
          receiptId = id;
          break;
        }
      } catch (e) {}
    }
    
    const replay = await sdk.experimental.replay.verify({ path: receiptId });
    expect(replay.passed).toBe(true);
  });

  it("should catch policy violations explicitly: agent attempting mainnet", async () => {
    const def = loadWorkflow("mainnet-policy-violation.json");

    const wf = await sdk.experimental.workflow.run({ steps: def.steps, dryRun: false });

    expect(wf.status).toBe("failed");
    expect(wf.errorEnvelope).toBeDefined();
    expect(wf.errorEnvelope?.code).toBe("POLICY_VIOLATION");
    expect(wf.errorEnvelope?.message).toMatch(/mainnet/);
  });

  it("should catch policy violations explicitly: agent mutating without dryRun", async () => {
    const def = loadWorkflow("dry-run-agent-policy.json");

    // The policy violation throws entirely, protecting the system at the deepest level
    await expect(
      strictSdk.experimental.workflow.run({ steps: def.steps, dryRun: false })
    ).rejects.toThrowError(/Agent Mode Policy Violation/);
  });

  it("should successfully orchestrate a multi-step workflow without failing", async () => {
    const def = loadWorkflow("multi-step-payment.json");
    const wf = await sdk.experimental.workflow.run({ steps: def.steps, dryRun: false });
    if (wf.status === "failed") console.log(wf.errorEnvelope);

    expect(wf.status).toBe("completed");
    expect(wf.steps.length).toBe(4);
    expect(wf.producedArtifacts.length).toBeGreaterThanOrEqual(4);
  });

  it("adversarial: tampering with a produced artifact must instantly fail replay", async () => {
    const def = loadWorkflow("simple-simulated-payment.json");
    // Modify to tx.send so it generates a receipt for replay verification
    def.steps.forEach((s: any) => { if (s.type === "tx.simulate") s.type = "tx.send"; });
    const wf = await sdk.experimental.workflow.run({ steps: def.steps, dryRun: false });

    // Adversary modifies a child artifact directly on disk
    const targetId = wf.producedArtifacts[0];
    const artifactsDir = path.join(tmpDir, ".hardkas", "artifacts");
    let targetPath: string | undefined;
    for (const sub of ["plans", "signed", "receipts", "lineage", "misc"]) {
      const dirPath = path.join(artifactsDir, sub);
      if (fs.existsSync(dirPath)) {
        const file = fs.readdirSync(dirPath).find((f) => f.includes(targetId) && f.endsWith(".json"));
        if (file) {
          targetPath = path.join(dirPath, file);
          break;
        }
      }
    }
    if (!targetPath) throw new Error("Artifact file not found");

    const childStr = fs.readFileSync(targetPath, "utf-8");
    const tampered = childStr.replace(
      /"amountSompi": "\d+"/,
      '"amountSompi": "999999999999"'
    );
    fs.writeFileSync(targetPath, tampered);

    // Run replay engine against the workflow lineage
    const store = new (require("@hardkas/artifacts").ProjectArtifactStore)(tmpDir);
    let receiptId = "";
    for (const id of wf.producedArtifacts) {
      try {
        const art = await store.readArtifact(id);
        if (art.schema === "hardkas.txReceipt") {
          receiptId = id;
          break;
        }
      } catch (e) {}
    }
    const replay = await sdk.experimental.replay.verify({ path: receiptId });

    // MUST FAIL determinism check
    expect(replay.passed).toBe(false);
    expect(replay.determinism).toBe("failed");
    expect(replay.report?.errors?.length).toBeGreaterThan(0);
    expect(replay.report.errors.some(e => e.includes("Amount divergence") || e.includes("Receipt divergence") || e.includes("failed cryptographic determinism check"))).toBe(true);
  });
});
