import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../../src/store.js";
import { createTxPlanArtifact, finalizeTxPlanIdentity } from "../../src/tx-plan.js";
import { createSimulatedSignedTxArtifact, createSimulatedTxReceipt } from "../../src/signed-tx.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../../src/canonical.js";
import { resolveArtifactHandle } from "../../src/artifact-handle.js";
import {
  classifyLookupInput,
  parseUntypedLookup,
  resolveArtifact,
  ArtifactResolveError
} from "../../src/resolve.js";

// Wave 1.2 · Closure Pack IC-5′ (Q3-II) / D-Q3.a
//   .2  explicit namespaces; an untyped input is only a contained path or a 64-hex artifactId,
//       anything else → NAMESPACE_REQUIRED with the exact replacement;
//   .3  no auto-detection, no fallback chain;
//   .4  every candidate is verified (declared version + label derivation) before it is
//       returned; an invalid candidate fails the lookup (CANDIDATE_INVALID), never skipped;
//   .5  ≥2 distinct valid candidates → typed ambiguity; identical copies collapse;
//   .7  paths are workspace-relative and contained, never relative to process.cwd();
//   IC-7.2/.3 a top-level `artifactId` is not an identity claim (P7).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

function makePlan(amount = 500n) {
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: amount }],
    change: { address: "kaspasim:qqalice", amountSompi: 1000n - amount - 10n },
    estimatedFeeSompi: 10n,
    estimatedMass: 100n
  };
  return createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: amount,
    plan
  });
}

const sealed = (body: Record<string, unknown>) => {
  const a: any = { ...body, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  return a;
};

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

const writeJson = (p: string, obj: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
};

describe("Wave 1.2 · IC-5′ verified, namespaced artifact resolution", () => {
  let ws: string;
  let store: ProjectArtifactStore;
  let plan: any;
  let signed: any;
  let receipt: any;
  let planPath: string;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-resolve-"));
    store = new ProjectArtifactStore(ws);
    plan = makePlan();
    signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    receipt = createSimulatedTxReceipt(plan, "simtx_" + "1".repeat(32), ctx, {
      parentArtifact: signed as typeof signed & { contentHash: string },
      sourceSignedId: signed.signedId
    });
    planPath = await store.writeArtifact(plan);
    await store.writeArtifact(signed);
    await store.writeArtifact(receipt);
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("T-IDMATRIX · an untyped input is only a contained path or a 64-hex artifactId; labels need a namespace", async () => {
    const relPlanPath = path.relative(ws, planPath).replace(/\\/g, "/");
    const matrix: Array<[string, string, string | undefined]> = [
      [plan.contentHash, "OK", undefined],
      [relPlanPath, "OK", undefined],
      [plan.planId, "NAMESPACE_REQUIRED", "plan"],
      [signed.signedId, "NAMESPACE_REQUIRED", "signed"],
      [receipt.txId, "NAMESPACE_REQUIRED", "tx"],
      [`wf_${"a".repeat(16)}`, "NAMESPACE_REQUIRED", "workflow"],
      ["something-else", "NAMESPACE_REQUIRED", undefined],
      [plan.contentHash.slice(0, 16), "NAMESPACE_REQUIRED", undefined]
    ];
    for (const [input, expected, namespace] of matrix) {
      expect(await codeOf(resolveArtifact(ws, input)), input).toBe(expected);
      if (expected === "NAMESPACE_REQUIRED") {
        expect(() => parseUntypedLookup(input)).toThrow(ArtifactResolveError);
        const cls = classifyLookupInput(input);
        if (namespace) {
          expect(cls.kind, input).toBe("namespaced");
          if (cls.kind === "namespaced") {
            expect(cls.namespace).toBe(namespace);
            expect(cls.replacement).toEqual({ [namespace]: input });
          }
        } else {
          expect(cls.kind, input).toBe("unknown");
        }
      }
    }
    // A 64-hex string that is really a Kaspa txId is read as an artifactId and is NOT found:
    // there is no fallback into the tx namespace (D-Q3.a).
    expect(await codeOf(resolveArtifact(ws, "c".repeat(64)))).toBe("ARTIFACT_NOT_FOUND");
    expect(await codeOf(resolveArtifact(ws, { artifact: "c".repeat(64) }))).toBe("ARTIFACT_NOT_FOUND");
  });

  it("typed lookups return the verified artifact of their own namespace, with its authentication scope", async () => {
    const byPlan = await resolveArtifact(ws, { plan: plan.planId });
    expect(byPlan.artifactId).toBe(plan.contentHash);
    expect(byPlan.namespace).toBe("plan");
    expect(byPlan.authScope).toBe("FULL");
    expect(byPlan.artifact.schema).toBe("hardkas.txPlan");

    const bySigned = await resolveArtifact(ws, { signed: signed.signedId });
    expect(bySigned.artifactId).toBe(signed.contentHash);

    const byId = await resolveArtifact(ws, { artifact: receipt.contentHash });
    expect(byId.artifactId).toBe(receipt.contentHash);
    expect(byId.resolvedBy).toBe("artifactId");

    const byTx = await resolveArtifact(ws, { tx: receipt.txId });
    expect(byTx.artifact.schema).toBe("hardkas.txReceipt");
    expect(byTx.artifactId).toBe(receipt.contentHash);
  });

  it("tx namespace never returns a signed artifact, even when the signed carries the same txId", async () => {
    // A signed whose txId equals the receipt's txId (sealed, self-consistent).
    const twin: any = structuredClone(signed);
    twin.txId = receipt.txId;
    twin.contentHash = calculateContentHash(twin, CURRENT_HASH_VERSION);
    twin.signedId = `signed-${twin.contentHash.slice(0, 16)}`;
    twin.lineage.artifactId = twin.contentHash;
    await store.writeArtifact(twin);

    const byTx = await resolveArtifact(ws, { tx: receipt.txId });
    expect(byTx.artifact.schema).toBe("hardkas.txReceipt");
    expect(byTx.artifactId).toBe(receipt.contentHash);
    expect(await codeOf(store.findReceiptByTxId(receipt.txId))).toBe("OK");
    expect(((await store.findReceiptByTxId(receipt.txId)) as any).contentHash).toBe(receipt.contentHash);
  });

  it("T-P7 · a top-level artifactId is not an identity claim: an impostor never shadows the artifact it names", async () => {
    const impostor = sealed({
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-25T00:00:00.000Z",
      decision: "ALLOW",
      rules: [],
      artifactId: plan.contentHash
    });
    // Written at the artifacts root, which the legacy resolver scanned FIRST.
    writeJson(path.join(ws, ".hardkas", "artifacts", `policy.v1-${plan.contentHash}.json`), impostor);

    const r = await resolveArtifact(ws, { artifact: plan.contentHash });
    expect(r.artifactId).toBe(plan.contentHash);
    expect(r.artifact.schema).toBe("hardkas.txPlan");
    expect(r.copies).toHaveLength(1);
    // Wave 1.3 (IC-7.3): a version-5 artifact may not carry a top-level artifactId at
    // all, so the v5 impostor is not reachable even by its own identity (fails closed).
    let ownError: any;
    try {
      await resolveArtifact(ws, { artifact: impostor.contentHash });
    } catch (e) {
      ownError = e;
    }
    expect(ownError?.code).toBe("CANDIDATE_INVALID");
    expect(String(ownError?.message)).toContain("FORBIDDEN_IDENTITY_FIELD");

    // A LEGACY (v4) impostor, where the field was allowed, is reachable only by its real identity.
    const legacyImpostor: any = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.12.0-rc.22",
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-01T00:00:00.000Z",
      decision: "DENY",
      rules: [],
      artifactId: plan.contentHash
    };
    legacyImpostor.contentHash = calculateContentHash(legacyImpostor, 4);
    writeJson(path.join(ws, ".hardkas", "artifacts", `policy.v1-legacy-${plan.contentHash}.json`), legacyImpostor);
    const again = await resolveArtifact(ws, { artifact: plan.contentHash });
    expect(again.artifactId).toBe(plan.contentHash);
    expect(again.artifact.schema).toBe("hardkas.txPlan");
    const own = await resolveArtifact(ws, { artifact: legacyImpostor.contentHash });
    expect(own.artifact.decision).toBe("DENY");
    expect(own.authScope).toBe("LEGACY");
  });

  it("CANDIDATE_INVALID · a tampered copy that claims the queried identity fails the lookup instead of being skipped", async () => {
    const tampered: any = structuredClone(plan);
    tampered.amountSompi = "999999";
    writeJson(path.join(ws, ".hardkas", "artifacts", "misc", "copy-of-plan.json"), tampered);

    for (const input of [{ artifact: plan.contentHash }, { plan: plan.planId }]) {
      try {
        await resolveArtifact(ws, input as any);
        expect.fail(`expected CANDIDATE_INVALID for ${JSON.stringify(input)}`);
      } catch (e: any) {
        expect(e).toBeInstanceOf(ArtifactResolveError);
        expect(e.code).toBe("CANDIDATE_INVALID");
        expect(String(e.context?.paths ?? e.context?.path ?? "")).toContain("copy-of-plan.json");
      }
    }
  });

  it("a label that does not derive from its artifact's hash is an invalid candidate (IC-5′.4), never a silent skip", async () => {
    const other: any = makePlan(600n);
    other.planId = plan.planId; // stale / forged label, body sealed for its own identity
    writeJson(path.join(ws, ".hardkas", "artifacts", "plans", "forged-label.json"), other);
    expect(await codeOf(resolveArtifact(ws, { plan: plan.planId }))).toBe("CANDIDATE_INVALID");
  });

  it("identical copies collapse; distinct valid receipts for one txId are RECEIPT_AMBIGUOUS_CONFLICT", async () => {
    // Identical copy of the plan elsewhere in the store.
    writeJson(path.join(ws, ".hardkas", "artifacts", "misc", "plan-copy.json"), plan);
    const r = await resolveArtifact(ws, { artifact: plan.contentHash });
    expect(r.artifactId).toBe(plan.contentHash);
    expect(r.copies).toHaveLength(2);
    expect((await resolveArtifact(ws, { plan: plan.planId })).copies).toHaveLength(2);

    // A second, different, valid receipt with the same txId.
    const other = createSimulatedTxReceipt(plan, receipt.txId, ctx, {
      parentArtifact: signed as typeof signed & { contentHash: string },
      sourceSignedId: signed.signedId,
      daaScore: "999"
    });
    expect(other.contentHash).not.toBe(receipt.contentHash);
    await store.writeArtifact(other);
    expect(await codeOf(resolveArtifact(ws, { tx: receipt.txId }))).toBe("RECEIPT_AMBIGUOUS_CONFLICT");
    expect(await codeOf(store.findReceiptByTxId(receipt.txId))).toBe("RECEIPT_AMBIGUOUS_CONFLICT");
  });

  it("legacy (hashVersion 4) artifacts resolve under their own rules and report authScope LEGACY", async () => {
    const legacy: any = structuredClone(plan);
    delete legacy.contentHash;
    legacy.hashVersion = 4;
    legacy.lineage = { artifactId: "", lineageId: "0".repeat(64), parentArtifactId: "", rootArtifactId: "0".repeat(64), sequence: 1 };
    const h = calculateContentHash(legacy, 4);
    legacy.contentHash = h;
    legacy.lineage.artifactId = h;
    legacy.planId = `plan-${h.slice(0, 16)}`;
    writeJson(path.join(ws, ".hardkas", "artifacts", "plans", "legacy-plan.json"), legacy);

    const byId = await resolveArtifact(ws, { artifact: h });
    expect(byId.authScope).toBe("LEGACY");
    const byLabel = await resolveArtifact(ws, { plan: legacy.planId });
    expect(byLabel.artifactId).toBe(h);
    expect(byLabel.authScope).toBe("LEGACY");
  });

  it("resolveArtifactHandle (CLI façade) refuses untyped labels with NAMESPACE_REQUIRED and accepts a namespace option", async () => {
    expect(await codeOf(resolveArtifactHandle(plan.planId, ws))).toBe("NAMESPACE_REQUIRED");
    expect(await codeOf(resolveArtifactHandle(receipt.txId, ws))).toBe("NAMESPACE_REQUIRED");
    const h = await resolveArtifactHandle(plan.planId, ws, { namespace: "plan" });
    expect(h.artifactId).toBe(plan.contentHash);
    expect(h.authScope).toBe("FULL");
    const t = await resolveArtifactHandle(receipt.txId, ws, { namespace: "tx" });
    expect(t.artifact.schema).toBe("hardkas.txReceipt");
    const byId = await resolveArtifactHandle(plan.contentHash, ws);
    expect(byId.resolvedBy).toBe("artifactId");
    expect(byId.artifactId).toBe(plan.contentHash);
  });

  it("store.readArtifact · 64-hex is verified identity, labels are refused, paths are workspace-relative not cwd-relative", async () => {
    expect(((await store.readArtifact(plan.contentHash)) as any).contentHash).toBe(plan.contentHash);
    expect(await codeOf(store.readArtifact(plan.planId))).toBe("NAMESPACE_REQUIRED");
    expect(await codeOf(store.readArtifact(receipt.txId))).toBe("NAMESPACE_REQUIRED");

    const rel = path.relative(ws, planPath);
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-elsewhere-"));
    const cwd = process.cwd();
    try {
      process.chdir(elsewhere);
      const viaPath: any = await store.readArtifact(rel);
      expect(viaPath.contentHash).toBe(plan.contentHash);
    } finally {
      process.chdir(cwd);
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("finalized plan re-sealed after a field change still resolves by its new identity and label", async () => {
    const changed: any = structuredClone(plan);
    changed.amountSompi = "777";
    finalizeTxPlanIdentity(changed);
    await store.writeArtifact(changed);
    expect((await resolveArtifact(ws, { plan: changed.planId })).artifactId).toBe(changed.contentHash);
    expect((await resolveArtifact(ws, { plan: plan.planId })).artifactId).toBe(plan.contentHash);
  });
});
