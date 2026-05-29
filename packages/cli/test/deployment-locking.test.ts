import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withLock } from "@hardkas/core";
import {
  trackDeployment,
  trackDeploymentInternal
} from "../src/runners/deployment-runners.js";
import { loadDeployment, deleteDeployment } from "@hardkas/artifacts";
import path from "node:path";
import fs from "node:fs";

describe("Deployment Locking", () => {
  const rootDir = process.cwd();
  const testLabel = "test-reentrancy-deployment";
  const testNetwork = "simnet";

  beforeEach(async () => {
    await deleteDeployment(rootDir, testNetwork, testLabel);
    await deleteDeployment(rootDir, testNetwork, testLabel + "-fail");
    await deleteDeployment(rootDir, testNetwork, testLabel + "-other");
    await deleteDeployment(rootDir, testNetwork, testLabel + "-persist");
  });

  afterEach(async () => {
    await deleteDeployment(rootDir, testNetwork, testLabel);
    await deleteDeployment(rootDir, testNetwork, testLabel + "-fail");
    await deleteDeployment(rootDir, testNetwork, testLabel + "-other");
    await deleteDeployment(rootDir, testNetwork, testLabel + "-persist");
  });

  it("trackDeploymentInternal can be used safely inside an outer lock", async () => {
    // Acquire the artifacts lock first
    await withLock(
      { rootDir, name: "artifacts", command: "test outer lock" },
      async () => {
        // While holding the lock, call the internal tracker
        await trackDeploymentInternal(rootDir, {
          label: testLabel,
          network: testNetwork,
          txId: "simtx_1234",
          status: "sent"
        });
      }
    );

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
      withLock(
        { rootDir, name: "artifacts", command: "test outer lock", wait: false },
        async () => {
          // This should throw because trackDeployment tries to acquire the same lock without wait
          await trackDeployment({
            label: testLabel,
            network: testNetwork
          });
        }
      )
    ).rejects.toThrow(/Workspace is locked/);
  });

  it("lock released correctly after tracking failure", async () => {
    // First, track a deployment to create it
    await trackDeployment({
      label: testLabel + "-fail",
      network: testNetwork,
      txId: "simtx_fail"
    });

    // Tracking the exact same deployment again will fail inside trackDeploymentInternal
    await expect(
      trackDeployment({
        label: testLabel + "-fail",
        network: testNetwork,
        txId: "simtx_fail_2"
      })
    ).rejects.toThrow(/already exists/);

    // Verify the lock is released and we can immediately acquire it again
    let lockAcquired = false;
    await withLock(
      { rootDir, name: "artifacts", command: "test release verification", wait: false },
      async () => {
        lockAcquired = true;
      }
    );
    expect(lockAcquired).toBe(true);
  });

  it("lock ownership verification (correct lock name used)", async () => {
    // Acquire a lock with a different name
    await withLock(
      {
        rootDir,
        name: "different-lock-name",
        command: "test different lock",
        wait: false
      },
      async () => {
        // trackDeployment uses the 'artifacts' lock, so it should succeed even if 'different-lock-name' is held!
        await trackDeployment({
          label: testLabel + "-other",
          network: testNetwork,
          txId: "simtx_other"
        });
      }
    );

    const record = await loadDeployment(rootDir, testNetwork, testLabel + "-other");
    expect(record).toBeDefined();
  });

  it("deployment persists after successful tracking", async () => {
    const label = testLabel + "-persist";
    await trackDeployment({
      label,
      network: testNetwork,
      txId: "simtx_persist",
      status: "confirmed"
    });

    // Check loadDeployment returns it
    const record = await loadDeployment(rootDir, testNetwork, label);
    expect(record).toBeDefined();
    expect(record?.label).toBe(label);
    expect(record?.status).toBe("confirmed");

    // Also verify file actually exists under .hardkas/deployments
    const expectedFilePath = path.join(
      rootDir,
      ".hardkas",
      "deployments",
      testNetwork,
      `${label}.json`
    );
    expect(fs.existsSync(expectedFilePath)).toBe(true);

    // Check contents match
    const fileContent = JSON.parse(fs.readFileSync(expectedFilePath, "utf-8"));
    expect(fileContent.label).toBe(label);
    expect(fileContent.txId).toBe("simtx_persist");
  });
});
