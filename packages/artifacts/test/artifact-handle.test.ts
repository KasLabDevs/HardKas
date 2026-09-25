import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { resolveArtifactHandle, ArtifactHandleError } from "../src/artifact-handle.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { createSimulatedSignedTxArtifact, createSimulatedTxReceipt } from "../src/signed-tx.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

// -----------------------------------------------------------------------------
// Wave 5 · DEF-17 · resolver contract regression, re-based on the rc.23
// remediation Wave 1.2 contract (Closure Pack IC-5′ / D-Q3.a):
//   - Accepts without a namespace exactly {absolute or workspace-relative path,
//     exact 64-hex artifactId}; every other token → NAMESPACE_REQUIRED
//   - Every candidate is verified before it is returned (CANDIDATE_INVALID)
//   - Identical copies collapse; a different body claiming the same id fails closed
//   - Directory input → ARTIFACT_INPUT_IS_DIRECTORY
//   - Identity is the recomputed contentHash: an artifact without lineage
//     (snapshot) IS id-resolvable (IC-5′.1, AUD-45); the Wave 5 exclusion is gone
//   - Workspace-relative anchors to workspaceRoot, NOT process.cwd()
// -----------------------------------------------------------------------------

const KASPA_TX_ID_NOT_ARTIFACT_ID =
  "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

function makePlan() {
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: 500n }],
    change: { address: "kaspasim:qqalice", amountSompi: 490n },
    estimatedFeeSompi: 10n,
    estimatedMass: 100n
  };
  return createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: 500n,
    plan
  });
}

function makeSnapshot() {
  const s: any = {
    schema: "hardkas.snapshot.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-09-25T00:00:00.000Z",
    daaScore: "1",
    accounts: [],
    utxos: []
    // Deliberately no lineage: identity is the recomputed contentHash.
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  return s;
}

describe("resolveArtifactHandle · Wave 5 · DEF-17 contract (IC-5′ re-base)", () => {
  let workspaceRoot: string;
  let artifactsDir: string;
  let plan: any;
  let signed: any;
  let receipt: any;
  let snapshot: any;
  let planPath: string;
  let signedPath: string;
  let receiptPath: string;
  let snapshotPath: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hk-wave5-handle-"));
    artifactsDir = path.join(workspaceRoot, ".hardkas", "artifacts");
    await fs.mkdir(path.join(artifactsDir, "signed"), { recursive: true });
    await fs.mkdir(path.join(artifactsDir, "receipts"), { recursive: true });
    await fs.mkdir(path.join(artifactsDir, "misc"), { recursive: true });

    plan = makePlan();
    signed = createSimulatedSignedTxArtifact(plan, "payload", ctx);
    signed.txId = KASPA_TX_ID_NOT_ARTIFACT_ID; // a real-looking txId on the signed; re-seal
    signed.contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
    signed.signedId = `signed-${signed.contentHash.slice(0, 16)}`;
    signed.lineage.artifactId = signed.contentHash;
    receipt = createSimulatedTxReceipt(plan, KASPA_TX_ID_NOT_ARTIFACT_ID, ctx, {
      parentArtifact: signed as typeof signed & { contentHash: string },
      sourceSignedId: signed.signedId
    });
    snapshot = makeSnapshot();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    planPath = path.join(artifactsDir, `${timestamp}-plan-${plan.contentHash.slice(0, 16)}.plan.json`);
    signedPath = path.join(artifactsDir, "signed", `signedTx-${signed.contentHash}.json`);
    receiptPath = path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`);
    snapshotPath = path.join(artifactsDir, "misc", `snapshot-${snapshot.contentHash}.json`);

    await fs.writeFile(planPath, JSON.stringify(plan));
    await fs.writeFile(signedPath, JSON.stringify(signed));
    await fs.writeFile(receiptPath, JSON.stringify(receipt));
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Path form
  // ---------------------------------------------------------------------------

  it("resolves an absolute in-workspace artifact path", async () => {
    const h = await resolveArtifactHandle(receiptPath, workspaceRoot);
    expect(h.resolvedBy).toBe("path");
    expect(h.path).toBe(path.resolve(receiptPath));
    expect(h.artifactId).toBe(receipt.contentHash);
    expect(h.authScope).toBe("FULL");
    expect(h.artifact.schema).toBe("hardkas.txReceipt");
  });

  it("resolves a workspace-relative artifact path anchored to workspaceRoot (not cwd)", async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      const relPath = path.join(".hardkas", "artifacts", "receipts", `txReceipt-${receipt.contentHash}.json`);
      const h = await resolveArtifactHandle(relPath, workspaceRoot);
      expect(h.resolvedBy).toBe("path");
      expect(h.artifactId).toBe(receipt.contentHash);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects a path outside the workspace with a typed error", async () => {
    const outside = path.join(os.tmpdir(), "not-in-workspace.json");
    await fs.writeFile(outside, JSON.stringify({ schema: "x" }));
    try {
      await expect(resolveArtifactHandle(outside, workspaceRoot)).rejects.toMatchObject({
        name: "ArtifactHandleError",
        code: "ARTIFACT_PATH_OUTSIDE_WORKSPACE"
      });
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it("rejects a directory input with ARTIFACT_INPUT_IS_DIRECTORY", async () => {
    await expect(resolveArtifactHandle(artifactsDir, workspaceRoot)).rejects.toMatchObject({
      name: "ArtifactHandleError",
      code: "ARTIFACT_INPUT_IS_DIRECTORY"
    });
  });

  it("rejects a missing path with ARTIFACT_NOT_FOUND", async () => {
    const missing = path.join(artifactsDir, "does-not-exist.json");
    await expect(resolveArtifactHandle(missing, workspaceRoot)).rejects.toMatchObject({
      name: "ArtifactHandleError",
      code: "ARTIFACT_NOT_FOUND"
    });
  });

  it("a path to a file that does not verify is CANDIDATE_INVALID (IC-5′.4)", async () => {
    const tampered = { ...receipt, amountSompi: "1" };
    const p = path.join(artifactsDir, "misc", "tampered.json");
    await fs.writeFile(p, JSON.stringify(tampered));
    await expect(resolveArtifactHandle(p, workspaceRoot)).rejects.toMatchObject({ code: "CANDIDATE_INVALID" });
  });

  // ---------------------------------------------------------------------------
  // ArtifactId form
  // ---------------------------------------------------------------------------

  it("resolves a plan by exact artifactId even at the legacy root layout", async () => {
    const h = await resolveArtifactHandle(plan.contentHash, workspaceRoot);
    expect(h.resolvedBy).toBe("artifactId");
    expect(h.artifactId).toBe(plan.contentHash);
    expect(h.artifact.schema).toBe("hardkas.txPlan");
  });

  it("resolves a signed by exact artifactId (canonical signed/ subdir)", async () => {
    const h = await resolveArtifactHandle(signed.contentHash, workspaceRoot);
    expect(h.resolvedBy).toBe("artifactId");
    expect(h.artifactId).toBe(signed.contentHash);
    expect(h.artifact.schema).toBe("hardkas.signedTx");
  });

  it("resolves a receipt by exact artifactId (canonical receipts/ subdir)", async () => {
    const h = await resolveArtifactHandle(receipt.contentHash, workspaceRoot);
    expect(h.resolvedBy).toBe("artifactId");
    expect(h.artifactId).toBe(receipt.contentHash);
    expect(h.artifact.schema).toBe("hardkas.txReceipt");
  });

  it("resolves a snapshot (no lineage) by its recomputed contentHash — identity by category (IC-5′.1, AUD-45)", async () => {
    // Wave 5 excluded contentHash-only artifacts from id resolution; the ratified
    // contract makes the recomputed contentHash THE identity of every artifact.
    const byId = await resolveArtifactHandle(snapshot.contentHash, workspaceRoot);
    expect(byId.resolvedBy).toBe("artifactId");
    expect(byId.artifactId).toBe(snapshot.contentHash);
    const byPath = await resolveArtifactHandle(snapshotPath, workspaceRoot);
    expect(byPath.resolvedBy).toBe("path");
    expect(byPath.artifactId).toBe(snapshot.contentHash);
  });

  // ---------------------------------------------------------------------------
  // Contract narrowness — everything else needs a namespace or is rejected
  // ---------------------------------------------------------------------------

  it("a partial artifactId needs a namespace (NAMESPACE_REQUIRED, D-Q3.a)", async () => {
    await expect(resolveArtifactHandle(receipt.contentHash.slice(0, 16), workspaceRoot)).rejects.toMatchObject({
      code: "NAMESPACE_REQUIRED"
    });
  });

  it("an arbitrary filename-substring token needs a namespace (NAMESPACE_REQUIRED)", async () => {
    await expect(resolveArtifactHandle("plan", workspaceRoot)).rejects.toMatchObject({ code: "NAMESPACE_REQUIRED" });
  });

  it("labels resolve only through their namespace, and are verified against the artifact's hash", async () => {
    await expect(resolveArtifactHandle(plan.planId, workspaceRoot)).rejects.toMatchObject({ code: "NAMESPACE_REQUIRED" });
    const h = await resolveArtifactHandle(plan.planId, workspaceRoot, { namespace: "plan" });
    expect(h.artifactId).toBe(plan.contentHash);
    expect(h.resolvedBy).toBe("label");
  });

  it("rejects a Kaspa txId (not an artifactId) with ARTIFACT_NOT_FOUND when it looks like a 64-hex", async () => {
    // A 64-hex string that is really a txId is read as an artifactId and is NOT found:
    // there is no fallback into the tx namespace, even though the signed and the
    // receipt on disk carry exactly this txId.
    await expect(resolveArtifactHandle(KASPA_TX_ID_NOT_ARTIFACT_ID, workspaceRoot)).rejects.toMatchObject({
      code: "ARTIFACT_NOT_FOUND"
    });
    // The tx namespace answers with the receipt, never the signed.
    const h = await resolveArtifactHandle(KASPA_TX_ID_NOT_ARTIFACT_ID, workspaceRoot, { namespace: "tx" });
    expect(h.artifact.schema).toBe("hardkas.txReceipt");
  });

  it("rejects malformed tokens", async () => {
    await expect(resolveArtifactHandle("   ", workspaceRoot)).rejects.toMatchObject({ code: "ARTIFACT_INPUT_UNRECOGNIZED" });
    // 63 hex chars: not a valid 64-hex id, not path-shaped → needs a namespace
    await expect(resolveArtifactHandle("a".repeat(63), workspaceRoot)).rejects.toMatchObject({ code: "NAMESPACE_REQUIRED" });
    // 64 chars but includes a non-hex char
    await expect(resolveArtifactHandle("z" + "a".repeat(63), workspaceRoot)).rejects.toMatchObject({ code: "NAMESPACE_REQUIRED" });
  });

  it("identical copies of one artifact collapse; a different body claiming the same id fails closed", async () => {
    // Identical copy elsewhere in the store (IC-5′.5).
    const dupPath = path.join(artifactsDir, "misc", `duplicate-${receipt.contentHash}.json`);
    await fs.writeFile(dupPath, JSON.stringify(receipt));
    const h = await resolveArtifactHandle(receipt.contentHash, workspaceRoot);
    expect(h.artifactId).toBe(receipt.contentHash);
    expect(h.copies).toHaveLength(2);

    // A file claiming the receipt's identity with different content (IC-5′.4).
    await fs.writeFile(dupPath, JSON.stringify({ ...receipt, amountSompi: "2" }));
    await expect(resolveArtifactHandle(receipt.contentHash, workspaceRoot)).rejects.toMatchObject({
      code: "CANDIDATE_INVALID"
    });
  });

  // ---------------------------------------------------------------------------
  // Instance guards
  // ---------------------------------------------------------------------------

  it("throws ArtifactHandleError instances (typed)", async () => {
    let caught: unknown;
    try {
      await resolveArtifactHandle("plan", workspaceRoot);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArtifactHandleError);
  });
});
