import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ProjectArtifactStore } from "../src/store.js";
import * as coreModule from "@hardkas/core";

// Wave 1 · Regression H — persistence failure atomicity across the lifecycle.
//
// The core invariant we're verifying is BROADER than per-file atomicity
// (which `writeFileAtomic` already gives us): after a failure at some point
// in the lifecycle chain, the resulting state must be TRUTHFUL — no child
// artifact appears durable when its persistence failed, and any previously
// persisted parent stays byte-unchanged.
//
// We drive this at the ProjectArtifactStore boundary because that is where
// every supported HardKAS lifecycle write funnels (see Wave 1 Phase 1 matrix).

function sha256File(p: string): string {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-w1-h-"));
}
function listAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

function mkPlanArtifact(idPrefix: string): any {
  return {
    schema: "hardkas.txPlan",
    schemaVersion: "hardkas.artifact.v1",
    hardkasVersion: "0.0.0-test",
    version: "1.0.0-alpha",
    hashVersion: 4,
    createdAt: "2026-09-18T00:00:00.000Z",
    networkId: "simnet",
    mode: "simulator",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    from: { input: "alice", address: "kaspasim:alice-addr" },
    to: { input: "bob", address: "kaspasim:bob-addr" },
    amountSompi: "100000",
    estimatedFeeSompi: "10",
    estimatedMass: "100",
    inputs: [],
    outputs: [{ address: "kaspasim:bob-addr", amountSompi: "100000" }],
    planId: `plan-${idPrefix}${"0".repeat(16 - idPrefix.length)}`,
    contentHash: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
    workflowId: `wf_${idPrefix}${"0".repeat(16 - idPrefix.length)}`,
    assumptionLevel: "local-simulated",
    lineage: {
      artifactId: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
      lineageId: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
      parentArtifactId: "",
      rootArtifactId: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
      sequence: 1
    },
    metadata: { schema: "hardkas.artifact.v1" }
  };
}

function mkSignedArtifact(idPrefix: string, planContentHash: string): any {
  return {
    schema: "hardkas.signedTx",
    schemaVersion: "hardkas.artifact.v1",
    hardkasVersion: "0.0.0-test",
    version: "1.0.0-alpha",
    hashVersion: 4,
    createdAt: "2026-09-18T00:00:01.000Z",
    status: "signed",
    mode: "simulator",
    networkId: "simnet",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    signedId: `signed-${idPrefix}${"0".repeat(16 - idPrefix.length)}`,
    contentHash: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
    sourcePlanId: `plan-${planContentHash.slice(0, 16)}`,
    from: { address: "kaspasim:alice-addr" },
    to: { address: "kaspasim:bob-addr" },
    amountSompi: "100000",
    signedTransaction: { format: "simulated", payload: "sim-payload" },
    workflowId: `wf_${planContentHash.slice(0, 16)}`,
    assumptionLevel: "local-simulated",
    lineage: {
      artifactId: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
      lineageId: `${planContentHash}`,
      parentArtifactId: planContentHash,
      rootArtifactId: `${planContentHash}`,
      sequence: 2
    }
  };
}

function mkReceiptArtifact(idPrefix: string, signedContentHash: string, planContentHash: string): any {
  return {
    schema: "hardkas.txReceipt",
    schemaVersion: "hardkas.txReceipt.v1",
    hardkasVersion: "0.0.0-test",
    version: "1.0.0-alpha",
    hashVersion: 4,
    createdAt: "2026-09-18T00:00:02.000Z",
    status: "submitted",
    mode: "simulator",
    networkId: "simnet",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    txId: `sim-${idPrefix}-tx`,
    sourceSignedId: `signed-${signedContentHash.slice(0, 16)}`,
    from: { address: "kaspasim:alice-addr" },
    to: { address: "kaspasim:bob-addr" },
    amountSompi: "100000",
    feeSompi: "10",
    contentHash: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
    workflowId: `wf_${planContentHash.slice(0, 16)}`,
    assumptionLevel: "local-simulated",
    lineage: {
      artifactId: `${idPrefix}${"0".repeat(64 - idPrefix.length)}`,
      lineageId: `${planContentHash}`,
      parentArtifactId: signedContentHash,
      rootArtifactId: `${planContentHash}`,
      sequence: 3
    }
  };
}

describe("H · persistence failure atomicity across the lifecycle chain", () => {
  it("Plan persisted → SignedTx persistence FAILS → plan is byte-unchanged, no signed on disk", async () => {
    const dir = mkTmp();
    const store = new ProjectArtifactStore(dir);
    const artifactsDir = path.join(dir, ".hardkas", "artifacts");

    // 1) Persist Plan successfully.
    const plan = mkPlanArtifact("plana");
    const planPath = await store.writeArtifact(plan);
    expect(fs.existsSync(planPath)).toBe(true);
    const planShaBefore = sha256File(planPath);
    const filesAfterPlan = listAllFiles(artifactsDir);

    // 2) Inject failure on the NEXT writeFileAtomic call.
    let failed = false;
    const spy = vi.spyOn(coreModule, "writeFileAtomic").mockImplementationOnce(async () => {
      failed = true;
      throw Object.assign(new Error("SIMULATED_ENOSPC: injected persistence failure"), {
        code: "ENOSPC"
      });
    });

    // 3) Attempt to persist the SignedTx.
    const signed = mkSignedArtifact("s1000", plan.contentHash);
    let thrown: unknown;
    try {
      await store.writeArtifact(signed);
    } catch (e) {
      thrown = e;
    }
    spy.mockRestore();

    expect(failed).toBe(true);
    expect(thrown).toBeDefined();
    expect(((thrown as any).message as string).includes("SIMULATED_ENOSPC")).toBe(true);

    // Invariant A: Plan is byte-unchanged.
    expect(sha256File(planPath)).toBe(planShaBefore);

    // Invariant B: No new files appeared. The failed signed is nowhere on disk.
    const filesAfterFailure = listAllFiles(artifactsDir);
    const newFiles = filesAfterFailure.filter((f) => !filesAfterPlan.includes(f));
    expect(newFiles).toEqual([]);

    // Invariant C: No orphan file for the signed artifact anywhere in the store tree.
    const signedShouldNotBeThere = filesAfterFailure.some((f) =>
      f.toLowerCase().includes(signed.contentHash.toLowerCase().slice(0, 16))
    );
    expect(signedShouldNotBeThere).toBe(false);
  });

  it("Plan + SignedTx persisted → Receipt persistence FAILS → parents byte-unchanged, no receipt on disk", async () => {
    const dir = mkTmp();
    const store = new ProjectArtifactStore(dir);
    const artifactsDir = path.join(dir, ".hardkas", "artifacts");

    // 1) Persist Plan and SignedTx successfully.
    const plan = mkPlanArtifact("planb");
    const planPath = await store.writeArtifact(plan);
    const signed = mkSignedArtifact("s2000", plan.contentHash);
    const signedPath = await store.writeArtifact(signed);
    const planShaBefore = sha256File(planPath);
    const signedShaBefore = sha256File(signedPath);
    const filesAfterSigned = listAllFiles(artifactsDir);

    // 2) Inject failure on the NEXT writeFileAtomic call.
    const spy = vi.spyOn(coreModule, "writeFileAtomic").mockImplementationOnce(async () => {
      throw Object.assign(new Error("SIMULATED_EACCES: injected persistence failure"), {
        code: "EACCES"
      });
    });

    // 3) Attempt to persist the Receipt.
    const receipt = mkReceiptArtifact("r3000", signed.contentHash, plan.contentHash);
    let thrown: unknown;
    try {
      await store.writeArtifact(receipt);
    } catch (e) {
      thrown = e;
    }
    spy.mockRestore();

    expect(thrown).toBeDefined();

    // Invariant A: Plan + Signed are byte-unchanged.
    expect(sha256File(planPath)).toBe(planShaBefore);
    expect(sha256File(signedPath)).toBe(signedShaBefore);

    // Invariant B: No new files appeared.
    const filesAfterFailure = listAllFiles(artifactsDir);
    const newFiles = filesAfterFailure.filter((f) => !filesAfterSigned.includes(f));
    expect(newFiles).toEqual([]);

    // Invariant C: Receipt is not on disk under any subdirectory.
    const receiptShouldNotBeThere = filesAfterFailure.some((f) =>
      f.toLowerCase().includes(receipt.contentHash.toLowerCase().slice(0, 16))
    );
    expect(receiptShouldNotBeThere).toBe(false);
  });

  it("failed write must NOT silently succeed via a fallback: subsequent successful write reflects only the second call", async () => {
    // Guard against the class of bug where a failed write path silently falls back
    // to a stale cache or rewrites a previous artifact. After a failure + retry,
    // there should be exactly ONE version of the artifact, matching the successful call.
    const dir = mkTmp();
    const store = new ProjectArtifactStore(dir);
    const artifactsDir = path.join(dir, ".hardkas", "artifacts");

    const receipt = mkReceiptArtifact("r4000", "0".repeat(64), "0".repeat(64));

    // Fail once, then succeed.
    const spy = vi.spyOn(coreModule, "writeFileAtomic").mockImplementationOnce(async () => {
      throw new Error("SIMULATED_TRANSIENT_FAILURE");
    });

    let firstThrown: unknown;
    try {
      await store.writeArtifact(receipt);
    } catch (e) {
      firstThrown = e;
    }
    expect(firstThrown).toBeDefined();

    // The retry uses the real writeFileAtomic (spy was mockImplementationOnce).
    const retryPath = await store.writeArtifact(receipt);
    spy.mockRestore();

    expect(fs.existsSync(retryPath)).toBe(true);
    const allFiles = listAllFiles(artifactsDir);
    const receiptFiles = allFiles.filter((f) =>
      f.toLowerCase().includes(receipt.contentHash.toLowerCase().slice(0, 16))
    );
    expect(receiptFiles.length).toBe(1);
  });
});
