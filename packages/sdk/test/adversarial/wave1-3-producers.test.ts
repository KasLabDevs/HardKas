import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import * as artifacts from "@hardkas/artifacts";
import { calculateContentHash, CURRENT_HASH_VERSION, verifyArtifactIntegritySync, resolveArtifact } from "@hardkas/artifacts";

// Wave 1.3 · producers under IC-1′…IC-7
//   N6 / IC-7.3–5  the workflow producer writes a version-5 artifact with no
//                  top-level artifactId; it resolves by identity and by workflowId, cold;
//   R-iii part 1   a real `send` records an immutable hardkas.txSubmission.v1:
//                  authenticated reference to the signed (by artifactId), the txId the
//                  node returned and the submit result; NO post-send state. The endpoint
//                  normalisation is ARCHITECTURE_BLOCKED: the raw locator stays in the
//                  unauthenticated `rpcUrl`, no `endpoint` field is written;
//   D-Q1.f         sdk.artifacts.migrate re-issues a legacy artifact as v5 plus a receipt,
//                  never rewriting the source.

const api = artifacts as any;
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

describe("Wave 1.3 · SDK producers", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-sdk-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("N6 · the workflow artifact is a version-5 artifact without a top-level artifactId, resolvable warm and cold", async () => {
    const run: any = await sdk.workflow.run({
      steps: [
        { type: "tx.plan", from: "alice", to: "bob", amount: 100 },
        { type: "tx.simulate" }
      ]
    });
    expect(run.status).toBe("completed");
    expect(run.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(run.artifactId).toBeUndefined();
    expect(run.workflowId).toMatch(/^wf_[0-9a-f]{16}$/);
    expect(calculateContentHash(run, CURRENT_HASH_VERSION)).toBe(run.contentHash);
    const verified = verifyArtifactIntegritySync(structuredClone(run), { strict: true });
    expect(verified.ok, codes(verified).join(",")).toBe(true);
    expect(verified.authScope).toBe("FULL");

    const cold = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    for (const instance of [sdk, cold]) {
      const byId = await instance.artifacts.read({ artifact: run.contentHash });
      expect(byId.contentHash).toBe(run.contentHash);
      const byWorkflow = await instance.artifacts.read({ workflow: run.workflowId });
      expect(byWorkflow.contentHash).toBe(run.contentHash);
    }
    expect((await resolveArtifact(ws, { artifact: run.contentHash })).authScope).toBe("FULL");
  });

  it("IC-7.4 · the workflow producer derives workflowId through the single derivation (same steps → same id)", async () => {
    const a: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: "alice", to: "bob", amount: 100 }], dryRun: true });
    const b: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: "alice", to: "bob", amount: 100 }], dryRun: true });
    const c: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: "alice", to: "bob", amount: 101 }], dryRun: true });
    expect(a.workflowId).toBe(b.workflowId);
    expect(a.workflowId).not.toBe(c.workflowId);
    expect(a.workflowId).not.toContain(a.contentHash.slice(0, 16));
  });

  it("R-iii · a real send writes an immutable txSubmission.v1 with the signed reference, the node's txId and the submit result; no post-send state", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(signed);
    const nodeTxId = "b".repeat(64);
    const submit = vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: nodeTxId } as any);

    const sent: any = await sdk.tx.send(signed, "http://127.0.0.1:16110/?token=secret");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(sent.mode).toBe("real");
    expect(sent.submitted).toBe(true);
    expect(sent.txId).toBe(nodeTxId);

    const submission: any = sent.submission;
    expect(submission).toBeDefined();
    expect(submission.schema).toBe("hardkas.txSubmission.v1");
    expect(sent.artifactId).toBe(submission.contentHash);
    expect(submission.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(submission.artifactId).toBeUndefined();
    expect(submission.signedArtifactId).toBe(signed.contentHash);
    expect(submission.lineage.parentArtifactId).toBe(signed.contentHash);
    expect(submission.lineage.artifactId).toBe(submission.contentHash);
    expect(submission.txId).toBe(nodeTxId);
    expect(submission.submitResult).toEqual({ accepted: true, transactionId: nodeTxId });
    for (const forbidden of ["status", "confirmedAt", "dagContext", "acceptingBlockHash", "confirmations", "observedAtDaaScore", "endpoint"]) {
      expect(submission, forbidden).not.toHaveProperty(forbidden);
    }
    // The raw locator is unauthenticated (ratified `rpcUrl`); the endpoint normalisation is blocked.
    expect(submission.rpcUrl).toBe("http://127.0.0.1:16110/?token=secret");
    expect(calculateContentHash({ ...submission, rpcUrl: "redacted" }, CURRENT_HASH_VERSION)).toBe(submission.contentHash);
    // The reference and the result ARE authenticated.
    expect(calculateContentHash({ ...submission, signedArtifactId: "0".repeat(64) }, CURRENT_HASH_VERSION)).not.toBe(submission.contentHash);
    expect(calculateContentHash({ ...submission, submitResult: { accepted: false } }, CURRENT_HASH_VERSION)).not.toBe(submission.contentHash);

    const verified = verifyArtifactIntegritySync(structuredClone(submission), { strict: true, workspaceRoot: ws });
    expect(verified.ok, codes(verified).join(",")).toBe(true);
    expect(verified.authScope).toBe("FULL");
    const semantics = artifacts.verifyArtifactSemantics(structuredClone(submission), { strict: true, workspaceRoot: ws });
    expect(semantics.ok, semantics.issues.map((i) => `${i.code}:${i.message}`).join(" | ")).toBe(true);

    // Persisted, and found through the `tx` namespace (never the signed).
    expect(fs.existsSync(sent.receiptPath)).toBe(true);
    const byTx = await sdk.artifacts.read({ tx: nodeTxId });
    expect(byTx.contentHash).toBe(submission.contentHash);
    const cold = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    expect((await cold.artifacts.read({ tx: nodeTxId })).schema).toBe("hardkas.txSubmission.v1");
  });

  it("R-iii · a rejected submit is recorded as a submission too (what HardKAS did), with the node's answer authenticated", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(signed);
    vi.spyOn(sdk.rpc, "submitTransaction").mockRejectedValue(new Error("Rejected transaction: orphan"));

    const sent: any = await sdk.tx.send(signed, "http://127.0.0.1:16110");
    expect(sent.submitted).toBe(false);
    expect(sent.submission.submitResult.accepted).toBe(false);
    expect(sent.submission.submitResult.error).toContain("orphan");
    expect(sent.submission).not.toHaveProperty("status");
    const verified = verifyArtifactIntegritySync(structuredClone(sent.submission), { strict: true });
    expect(verified.ok, codes(verified).join(",")).toBe(true);
  });

  it("R-iii · two distinct submissions for one txId are an ambiguity, never a silent pick", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(signed);
    const nodeTxId = "c".repeat(64);
    vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: nodeTxId } as any);
    const first: any = await sdk.tx.send(signed, "http://127.0.0.1:16110");
    // A second submission of a different signed artifact that the node answered with the same txId.
    const other: any = structuredClone(first.submission);
    other.signedArtifactId = "d".repeat(64);
    other.lineage = { ...other.lineage, parentArtifactId: "d".repeat(64) };
    delete other.contentHash;
    other.contentHash = calculateContentHash(other, CURRENT_HASH_VERSION);
    other.lineage.artifactId = other.contentHash;
    await sdk.artifacts.write(other);
    expect(await codeOf(sdk.artifacts.read({ tx: nodeTxId }))).toBe("RECEIPT_AMBIGUOUS_CONFLICT");
  });

  it("D-Q1.f · sdk.artifacts.migrate re-issues a legacy v4 plan as v5 plus a MigrationReceipt; the source stays as written", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    // A plan exactly as rc.22 wrote it: v4, two-pass lineage, label copies after hashing.
    const legacy: any = structuredClone(plan);
    legacy.hashVersion = 4;
    delete legacy.contentHash;
    delete legacy.planId;
    const firstPass = calculateContentHash(legacy, 4);
    legacy.lineage = { artifactId: "", lineageId: firstPass, parentArtifactId: "", rootArtifactId: firstPass, sequence: 1 };
    legacy.contentHash = calculateContentHash(legacy, 4);
    legacy.lineage.artifactId = legacy.contentHash;
    legacy.planId = `plan-${legacy.contentHash.slice(0, 16)}`;
    legacy.artifactId = legacy.contentHash;
    const legacyPath = path.join(ws, "legacy", "plan.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
    const before = fs.readFileSync(legacyPath, "utf8");

    const out: any = await sdk.artifacts.migrate("legacy/plan.json", { to: 5, migrationId: "mig-w13-sdk" });
    expect(fs.readFileSync(legacyPath, "utf8")).toBe(before);
    expect(out.migrated.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(out.migrated.artifactId).toBeUndefined();
    expect(out.migrated.legacyClaims.fields.artifactId).toBe(legacy.contentHash);
    expect(out.migrated.lineage.parentArtifactId).toBe(legacy.contentHash);
    expect(out.receipt.schema).toBe("hardkas.migrationReceipt.v1");
    expect(out.receipt.lineage.lineageId).toMatch(/^[0-9a-f]{64}$/);
    expect(out.receipt.oldHash).toBe(legacy.contentHash);
    expect(out.receipt.newHash).toBe(out.migrated.contentHash);

    for (const id of [out.migrated.contentHash, out.receipt.contentHash]) {
      const v = await sdk.artifacts.verify(id, { throwOnInvalid: false, strict: true });
      expect(v.valid ?? v.ok, JSON.stringify(v.details?.issues ?? v)).toBe(true);
      expect(v.authScope).toBe("FULL");
    }
    expect(await codeOf(sdk.artifacts.migrate(out.migrated.contentHash, { to: 5 }))).toBe("MIGRATION_NOT_NEEDED");
  });
});
