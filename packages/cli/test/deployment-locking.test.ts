import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withLock } from "@hardkas/core";
import { trackDeployment, trackDeploymentInternal } from "../src/runners/deployment-runners.js";
import { loadDeployment, deleteDeployment } from "@hardkas/artifacts";
import path from "node:path";
import os from "node:os";

describe("Deployment Locking", () => {
  const rootDir = process.cwd();
  const testLabel = "test-reentrancy-deployment";
  const testNetwork = "simnet";

  beforeEach(async () => {
    await deleteDeployment(rootDir, testNetwork, testLabel);
  });

  afterEach(async () => {
    await deleteDeployment(rootDir, testNetwork, testLabel);
  });

  it("trackDeploymentInternal can be used safely inside an outer lock", async () => {
    // Acquire the artifacts lock first
    await withLock({ rootDir, name: "artifacts", command: "test outer lock" }, async () => {
      // While holding the lock, call the internal tracker
      await trackDeploymentInternal(rootDir, {
        label: testLabel,
        network: testNetwork,
        txId: "simtx_1234",
        status: "sent"
      });
    });

    // Verify it persisted
    const record = await loadDeployment(rootDir, testNetwork, testLabel);
    expect(record).toBeDefined();
    expect(record?.label).toBe(testLabel);
    expect(record?.txId).toBe("simtx_1234");
  });

  it("trackDeployment acquires its own lock and succeeds", async () => {
    await trackDeployment({
      label: testLabel,
      network: testNetwork,
      txId: "simtx_5678",
      status: "confirmed"
    });

    const record = await loadDeployment(rootDir, testNetwork, testLabel);
    expect(record).toBeDefined();
    expect(record?.txId).toBe("simtx_5678");
  });
  
  it("trackDeployment fails with lock error if outer lock is already held", async () => {
    await expect(
      withLock({ rootDir, name: "artifacts", command: "test outer lock", wait: false }, async () => {
        // This should throw because trackDeployment tries to acquire the same lock without wait
        await trackDeployment({
          label: testLabel,
          network: testNetwork,
        });
      })
    ).rejects.toThrow(/Workspace is locked/);
  });
});
