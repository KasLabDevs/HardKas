import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual = await vi.importActual("@hardkas/kaspa-rpc");
  return {
    ...(actual as any),
    JsonWrpcKaspaClient: vi.fn().mockImplementation(() => ({
      getInfo: vi.fn().mockResolvedValue({ networkId: "simnet", virtualDaaScore: 100n }),
      healthCheck: vi
        .fn()
        .mockResolvedValue({ status: "healthy", info: { networkId: "simnet" } }),
      getUtxosByAddress: vi.fn().mockResolvedValue([
        {
          outpoint: { transactionId: "a".repeat(64), index: 0 },
          address: "kaspa:sim_alice",
          amountSompi: 100000000n,
          scriptPublicKey: "00"
        }
      ]),
      submitTransaction: vi.fn().mockResolvedValue({ transactionId: "b".repeat(64) })
    }))
  };
});

describe("Workflow Runtime Contract", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-workflow-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should orchestrate a workflow and produce a deterministic artifact", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir, mode: "developer" });

    const artifact = await sdk.workflow.run({
      steps: [
        { type: "tx.plan", from: "alice", to: "bob", amount: 100 },
        { type: "tx.simulate" }
      ],
      dryRun: true // Avoid saving to disk for quick test
    });

    if (artifact.status === "failed") {
      console.log("WORKFLOW FAILED:", artifact.errorEnvelope, artifact.steps);
    }
    expect(artifact.schema).toBe("hardkas.workflow.v1");
    expect(artifact.status).toBe("completed");
    expect(artifact.steps).toHaveLength(2);
    expect(artifact.steps[0].type).toBe("tx.plan");
    expect(artifact.steps[0].status).toBe("success");
    expect(artifact.steps[1].type).toBe("tx.simulate");
  });

  it("should catch errors in steps and mark the workflow as failed", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir, mode: "developer" });

    const artifact = await sdk.workflow.run({
      steps: [
        { type: "tx.plan", from: "alice", to: "bob", amount: 100 },
        { type: "simulate-failure" }, // This should trigger the failure mock
        { type: "tx.send" } // This should be skipped
      ],
      dryRun: true
    });

    expect(artifact.status).toBe("failed");
    expect(artifact.steps).toHaveLength(2); // plan, and the failed simulate
    expect(artifact.steps[1].type).toBe("simulate-failure");
    expect(artifact.steps[1].status).toBe("failed");
    expect(artifact.errorEnvelope).toBeDefined();
    expect(artifact.errorEnvelope?.code).toBe("MOCKED_FAIL");
  });

  it("should reject simulate-failure unconditionally in agent mode", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir, mode: "agent" });

    const artifact = await sdk.workflow.run({
      steps: [{ type: "simulate-failure" }],
      dryRun: true
    });

    expect(artifact.status).toBe("failed");
    expect(artifact.steps).toHaveLength(1);
    expect(artifact.steps[0].type).toBe("simulate-failure");
    expect(artifact.steps[0].status).toBe("failed");
    expect(artifact.errorEnvelope).toBeDefined();
    expect(artifact.errorEnvelope?.code).toBe("POLICY_DENIED");
    expect(artifact.errorEnvelope?.message).toMatch(/strictly prohibited in agent mode/);
  });

  it("should enforce mutation policy (requireDryRun) when writing artifacts", async () => {
    const sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      policy: { requireDryRun: true }
    });

    // If we pass dryRun: false, it should throw because policy enforces dryRun: true
    await expect(
      sdk.workflow.run({
        steps: [{ type: "dummy" }],
        dryRun: false
      })
    ).rejects.toThrow(/requireDryRun/);
  });
});
