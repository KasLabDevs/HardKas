import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveArtifactHandle, ArtifactHandleError } from "../src/artifact-handle.js";

// -----------------------------------------------------------------------------
// Wave 5 · DEF-17 · resolver contract regression
//
// Contract enforced (see packages/artifacts/src/artifact-handle.ts):
//   - Accepts exactly {absolute or workspace-relative path, exact 64-hex artifactId}
//   - Fail-closed on ambiguity
//   - Directory input → ARTIFACT_INPUT_IS_DIRECTORY
//   - contentHash-only artifacts (no lineage.artifactId) are NOT ID-resolvable
//   - Workspace-relative anchors to workspaceRoot, NOT process.cwd()
//   - Substring / partial hash / txId / planId / signedId are rejected
// -----------------------------------------------------------------------------

const PLAN_ARTIFACT_ID =
  "12819e7ae148ce513616114625135e450ea592f0980f55530e3fc6c56115e131";
const SIGNED_ARTIFACT_ID =
  "b66b90960d165c1026fdb68342b86f72883acd19cd3e2e22f94f57be3d91603c";
const RECEIPT_ARTIFACT_ID =
  "c07596a5ac21ca4a746a1da21589e5e5b88dcb298985fe733b3549184d92f48b";
const SNAPSHOT_CONTENT_HASH =
  "f4233ee329e8d8996782daea6faa675b330e18ea3efb342026981b8b9a068b58";
const KASPA_TX_ID_NOT_ARTIFACT_ID =
  "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";

function makePlan(id: string, planId: string) {
  return {
    schema: "hardkas.txPlan",
    planId,
    contentHash: id,
    lineage: { artifactId: id, parentArtifactId: "", sequence: 1 }
  };
}

function makeSigned(id: string, parentId: string, txId: string) {
  return {
    schema: "hardkas.signedTx",
    signedId: `signed-${id.slice(0, 16)}`,
    contentHash: id,
    txId,
    lineage: { artifactId: id, parentArtifactId: parentId, sequence: 2 }
  };
}

function makeReceipt(id: string, parentId: string, txId: string) {
  return {
    schema: "hardkas.txReceipt",
    contentHash: id,
    txId,
    lineage: { artifactId: id, parentArtifactId: parentId, sequence: 3 }
  };
}

function makeSnapshot(contentHash: string) {
  return {
    schema: "hardkas.snapshot.v1",
    contentHash
    // Deliberately no lineage.artifactId.
  };
}

describe("resolveArtifactHandle · Wave 5 · DEF-17 contract", () => {
  let workspaceRoot: string;
  let artifactsDir: string;
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

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    planPath = path.join(
      artifactsDir,
      `${timestamp}-plan-${PLAN_ARTIFACT_ID.slice(0, 16)}.plan.json`
    );
    signedPath = path.join(
      artifactsDir,
      "signed",
      `signedTx-${SIGNED_ARTIFACT_ID}.json`
    );
    receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${RECEIPT_ARTIFACT_ID}.json`
    );
    snapshotPath = path.join(
      artifactsDir,
      "misc",
      `snapshot-${SNAPSHOT_CONTENT_HASH}.json`
    );

    await fs.writeFile(
      planPath,
      JSON.stringify(makePlan(PLAN_ARTIFACT_ID, `plan-${PLAN_ARTIFACT_ID.slice(0, 16)}`))
    );
    await fs.writeFile(
      signedPath,
      JSON.stringify(makeSigned(SIGNED_ARTIFACT_ID, PLAN_ARTIFACT_ID, KASPA_TX_ID_NOT_ARTIFACT_ID))
    );
    await fs.writeFile(
      receiptPath,
      JSON.stringify(makeReceipt(RECEIPT_ARTIFACT_ID, SIGNED_ARTIFACT_ID, KASPA_TX_ID_NOT_ARTIFACT_ID))
    );
    await fs.writeFile(
      snapshotPath,
      JSON.stringify(makeSnapshot(SNAPSHOT_CONTENT_HASH))
    );
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
    expect(h.artifactId).toBe(RECEIPT_ARTIFACT_ID);
    expect(h.artifact.schema).toBe("hardkas.txReceipt");
  });

  it("resolves a workspace-relative artifact path anchored to workspaceRoot (not cwd)", async () => {
    // Deliberately invoke from a working directory OTHER than workspaceRoot to
    // prove the anchor rule: workspace-relative paths must resolve against the
    // explicit workspaceRoot argument.
    const originalCwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      const relPath = path.join(
        ".hardkas",
        "artifacts",
        "receipts",
        `txReceipt-${RECEIPT_ARTIFACT_ID}.json`
      );
      const h = await resolveArtifactHandle(relPath, workspaceRoot);
      expect(h.resolvedBy).toBe("path");
      expect(h.artifactId).toBe(RECEIPT_ARTIFACT_ID);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects a path outside the workspace with a typed error", async () => {
    const outside = path.join(os.tmpdir(), "not-in-workspace.json");
    await fs.writeFile(outside, JSON.stringify({ schema: "x" }));
    try {
      await expect(
        resolveArtifactHandle(outside, workspaceRoot)
      ).rejects.toMatchObject({
        name: "ArtifactHandleError",
        code: "ARTIFACT_PATH_OUTSIDE_WORKSPACE"
      });
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it("rejects a directory input with ARTIFACT_INPUT_IS_DIRECTORY", async () => {
    await expect(
      resolveArtifactHandle(artifactsDir, workspaceRoot)
    ).rejects.toMatchObject({
      name: "ArtifactHandleError",
      code: "ARTIFACT_INPUT_IS_DIRECTORY"
    });
  });

  it("rejects a missing path with ARTIFACT_NOT_FOUND", async () => {
    const missing = path.join(artifactsDir, "does-not-exist.json");
    await expect(
      resolveArtifactHandle(missing, workspaceRoot)
    ).rejects.toMatchObject({
      name: "ArtifactHandleError",
      code: "ARTIFACT_NOT_FOUND"
    });
  });

  // ---------------------------------------------------------------------------
  // ArtifactId form
  // ---------------------------------------------------------------------------

  it("resolves a plan by exact artifactId even at the legacy root layout", async () => {
    const h = await resolveArtifactHandle(PLAN_ARTIFACT_ID, workspaceRoot);
    expect(h.resolvedBy).toBe("artifactId");
    expect(h.artifactId).toBe(PLAN_ARTIFACT_ID);
    expect(h.artifact.schema).toBe("hardkas.txPlan");
  });

  it("resolves a signed by exact artifactId (canonical signed/ subdir)", async () => {
    const h = await resolveArtifactHandle(SIGNED_ARTIFACT_ID, workspaceRoot);
    expect(h.resolvedBy).toBe("artifactId");
    expect(h.artifactId).toBe(SIGNED_ARTIFACT_ID);
    expect(h.artifact.schema).toBe("hardkas.signedTx");
  });

  it("resolves a receipt by exact artifactId (canonical receipts/ subdir)", async () => {
    const h = await resolveArtifactHandle(RECEIPT_ARTIFACT_ID, workspaceRoot);
    expect(h.resolvedBy).toBe("artifactId");
    expect(h.artifactId).toBe(RECEIPT_ARTIFACT_ID);
    expect(h.artifact.schema).toBe("hardkas.txReceipt");
  });

  // ---------------------------------------------------------------------------
  // Contract narrowness — everything else is rejected
  // ---------------------------------------------------------------------------

  it("does NOT resolve a snapshot's contentHash as an artifactId (snapshot has no lineage.artifactId)", async () => {
    await expect(
      resolveArtifactHandle(SNAPSHOT_CONTENT_HASH, workspaceRoot)
    ).rejects.toMatchObject({
      code: "ARTIFACT_NOT_FOUND"
    });
    // The snapshot is still path-resolvable, which proves the distinction
    // between contentHash-only and artifactId-carrying artifacts.
    const h = await resolveArtifactHandle(snapshotPath, workspaceRoot);
    expect(h.resolvedBy).toBe("path");
    expect(h.artifactId).toBeUndefined();
    expect(h.artifact.contentHash).toBe(SNAPSHOT_CONTENT_HASH);
  });

  it("rejects a partial artifactId with ARTIFACT_INPUT_UNRECOGNIZED", async () => {
    await expect(
      resolveArtifactHandle(RECEIPT_ARTIFACT_ID.slice(0, 16), workspaceRoot)
    ).rejects.toMatchObject({
      code: "ARTIFACT_INPUT_UNRECOGNIZED"
    });
  });

  it("rejects an arbitrary filename-substring token with ARTIFACT_INPUT_UNRECOGNIZED", async () => {
    await expect(
      resolveArtifactHandle("plan", workspaceRoot)
    ).rejects.toMatchObject({
      code: "ARTIFACT_INPUT_UNRECOGNIZED"
    });
  });

  it("rejects a Kaspa txId (not an artifactId) with ARTIFACT_NOT_FOUND when it looks like a 64-hex", async () => {
    // A 64-hex string that does NOT match any lineage.artifactId in the
    // workspace must fail closed. This is the txId-vs-artifactId distinction:
    // txId can be shaped like an artifactId but is never one.
    await expect(
      resolveArtifactHandle(KASPA_TX_ID_NOT_ARTIFACT_ID, workspaceRoot)
    ).rejects.toMatchObject({
      code: "ARTIFACT_NOT_FOUND"
    });
  });

  it("rejects malformed tokens", async () => {
    await expect(
      resolveArtifactHandle("   ", workspaceRoot)
    ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_UNRECOGNIZED" });

    // 63 hex chars: not a valid 64-hex id, not path-shaped
    await expect(
      resolveArtifactHandle("a".repeat(63), workspaceRoot)
    ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_UNRECOGNIZED" });

    // 64 chars but includes a non-hex char
    await expect(
      resolveArtifactHandle("z" + "a".repeat(63), workspaceRoot)
    ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_UNRECOGNIZED" });
  });

  it("rejects duplicate exact artifactId with ARTIFACT_AMBIGUOUS", async () => {
    // Simulate a workspace where two files carry the same lineage.artifactId
    // (should never happen in practice, but the resolver must fail-closed).
    const dupPath = path.join(
      artifactsDir,
      "misc",
      `duplicate-${RECEIPT_ARTIFACT_ID}.json`
    );
    await fs.writeFile(
      dupPath,
      JSON.stringify({
        schema: "hardkas.txReceipt",
        contentHash: RECEIPT_ARTIFACT_ID,
        lineage: {
          artifactId: RECEIPT_ARTIFACT_ID,
          parentArtifactId: SIGNED_ARTIFACT_ID,
          sequence: 3
        }
      })
    );

    await expect(
      resolveArtifactHandle(RECEIPT_ARTIFACT_ID, workspaceRoot)
    ).rejects.toMatchObject({
      code: "ARTIFACT_AMBIGUOUS"
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
