import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../../src/store.js";
import { createTxPlanArtifact, finalizeTxPlanIdentity } from "../../src/tx-plan.js";
import { createSimulatedSignedTxArtifact } from "../../src/signed-tx.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../../src/canonical.js";
import { verifyArtifactSemantics } from "../../src/verify.js";
import { verifySilverRecordReference } from "../../src/silver-refs.js";

// Wave 1.2 · persisted references (IC-5′.6): policyRefs, networkProfileRef, assumptionRef
// and lineage parents are authenticated artifactIds, resolved ONLY by verified identity
// inside the workspace store (IC-5′.7: never relative to process.cwd(), AUX-02), never
// by a top-level `artifactId` (AUD-10 / P7), a label, a txId or a file name.
// N1 (1.2 half): Silver nested references are checked against the target's recomputed
// identity and the authenticated `artifactSha256` digest, also for v4 records.

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

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

function policy(decision: "ALLOW" | "DENY", extra: Record<string, unknown> = {}) {
  const p: any = {
    schema: "hardkas.policy.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-09-25T00:00:00.000Z",
    decision,
    rules: [],
    ...extra
  };
  p.contentHash = calculateContentHash(p, CURRENT_HASH_VERSION);
  return p;
}

const writeJson = (p: string, obj: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
};

describe("Wave 1.2 · persisted references resolve only by verified identity", () => {
  let ws: string;
  let store: ProjectArtifactStore;
  let deny: any;
  let plan: any;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-refs-"));
    store = new ProjectArtifactStore(ws);
    deny = policy("DENY");
    await store.writeArtifact(deny);
    plan = makePlan();
    plan.policyRefs = [deny.contentHash];
    finalizeTxPlanIdentity(plan);
    await store.writeArtifact(plan);
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("baseline: a plan bound to a DENY policy fails strict semantics with POLICY_VIOLATION", () => {
    const r = verifyArtifactSemantics(plan, { strict: true, workspaceRoot: ws });
    expect(codes(r)).toContain("POLICY_VIOLATION");
  });

  it("T-P7 (AUD-10) · an ALLOW impostor claiming the DENY policy's identity via top-level artifactId is never the reference target", () => {
    const impostor = policy("ALLOW", { artifactId: deny.contentHash });
    // Root of the artifacts dir, scanned first by the legacy resolver; file name carries the hash.
    writeJson(path.join(ws, ".hardkas", "artifacts", `policy.v1-${deny.contentHash}.json`), impostor);

    const r = verifyArtifactSemantics(plan, { strict: true, workspaceRoot: ws });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("POLICY_VIOLATION");
    expect(codes(r)).not.toContain("REFERENCE_HASH_MISMATCH");
  });

  it("T-AUX02 · references are never resolved relative to process.cwd()", () => {
    const allow = policy("ALLOW");
    const other = makePlan(400n);
    other.policyRefs = [allow.contentHash];
    finalizeTxPlanIdentity(other);
    // The ALLOW policy exists only under a foreign cwd (`<cwd>/artifacts` and `<cwd>/.hardkas/artifacts`).
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-foreign-cwd-"));
    writeJson(path.join(foreign, "artifacts", `policy.v1-${allow.contentHash}.json`), allow);
    writeJson(path.join(foreign, ".hardkas", "artifacts", `policy.v1-${allow.contentHash}.json`), allow);
    const cwd = process.cwd();
    try {
      process.chdir(foreign);
      const r = verifyArtifactSemantics(other, { strict: true, workspaceRoot: ws });
      expect(codes(r)).toContain("REFERENCE_MISSING");
      expect(codes(r)).not.toContain("POLICY_VIOLATION");
    } finally {
      process.chdir(cwd);
      fs.rmSync(foreign, { recursive: true, force: true });
    }
  });

  it("IC-5′.6 · a persisted reference that is a label (not a 64-hex artifactId) is REFERENCE_INVALID, not resolved", () => {
    const labelled = makePlan(300n);
    labelled.policyRefs = ["policy-allow-latest"];
    finalizeTxPlanIdentity(labelled);
    const r = verifyArtifactSemantics(labelled, { strict: true, workspaceRoot: ws });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("REFERENCE_INVALID");
  });

  it("IC-5′.6 · a referenced policy whose stored copy was tampered is REFERENCE_HASH_MISMATCH (verified before use)", () => {
    const stored = path.join(ws, ".hardkas", "artifacts", "misc", `policy.v1-${deny.contentHash}.json`);
    const files = fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "misc"));
    const denyFile = files.find((f) => f.includes(deny.contentHash)) ?? path.basename(stored);
    const target = path.join(ws, ".hardkas", "artifacts", "misc", denyFile);
    const tampered = { ...JSON.parse(fs.readFileSync(target, "utf-8")), decision: "ALLOW" };
    fs.writeFileSync(target, JSON.stringify(tampered));
    const r = verifyArtifactSemantics(plan, { strict: true, workspaceRoot: ws });
    expect(r.ok).toBe(false);
    expect(codes(r).some((c) => c === "REFERENCE_HASH_MISMATCH" || c === "REFERENCE_CORRUPT")).toBe(true);
    expect(codes(r)).not.toContain("POLICY_VIOLATION"); // the tampered ALLOW is not evaluated
  });

  it("lineage parents resolve only through lineage.parentArtifactId; sourcePlanId (a label) never resolves a parent", () => {
    const signed: any = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    // Drop the authenticated parent link, keep the label; re-seal so integrity holds.
    delete signed.lineage;
    signed.contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
    signed.signedId = `signed-${signed.contentHash.slice(0, 16)}`;
    const r = verifyArtifactSemantics(signed, { strict: true, workspaceRoot: ws });
    expect(codes(r)).not.toContain("POLICY_VIOLATION"); // the plan's policy was NOT reached through the label
    expect(codes(r).some((c) => c === "PARENT_MISSING" || c === "MISSING_LINEAGE")).toBe(true);
  });
});

describe("Wave 1.2 · N1 · Silver nested references are checked against the target's identity and digest", () => {
  const compileRecord = (artifactJson: string, extra: Record<string, unknown> = {}) => {
    const rec: any = {
      schema: "hardkas.silverCompile.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      mode: "localnet",
      hashVersion: 4,
      networkId: "simnet",
      createdAt: "2026-09-25T00:00:00.000Z",
      contract: "Escrow",
      artifactJson,
      provenance: { artifactSha256: sha256(artifactJson), compiler: { releaseTag: "v1.0.0" } },
      ...extra
    };
    rec.contentHash = calculateContentHash(rec, 4);
    rec.artifactId = `silverCompile-${rec.contentHash.slice(0, 16)}`;
    return rec;
  };

  it("accepts the record the reference was made for", () => {
    const a = compileRecord('{"contract":"A"}');
    const ref = { path: "records/a.json", contentHash: a.contentHash, artifactSha256: a.provenance.artifactSha256 };
    const r = verifySilverRecordReference(ref, a);
    expect(r.ok, codes(r).join(",")).toBe(true);
  });

  it("T-N1a · a swapped compile record is refused even when the (v4-unauthenticated) contentHash was updated to match it", () => {
    const a = compileRecord('{"contract":"A"}');
    const b = compileRecord('{"contract":"B"}');
    // The attacker rewrote `compileRecord.contentHash` in the deploy record (unauthenticated in v4)
    // but cannot rewrite `artifactSha256`, which v4 authenticates.
    const forgedRef = { path: "records/b.json", contentHash: b.contentHash, artifactSha256: a.provenance.artifactSha256 };
    const r = verifySilverRecordReference(forgedRef, b);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("SILVER_REFERENCE_DIGEST_MISMATCH");
  });

  it("a reference whose contentHash does not match the target's recomputed identity is REFERENCE_HASH_MISMATCH", () => {
    const a = compileRecord('{"contract":"A"}');
    const r = verifySilverRecordReference({ path: "x", contentHash: "0".repeat(64), artifactSha256: a.provenance.artifactSha256 }, a);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("REFERENCE_HASH_MISMATCH");
  });

  it("a target whose body no longer hashes to its declared identity is CANDIDATE_INVALID", () => {
    const a = compileRecord('{"contract":"A"}');
    const tampered = { ...a, contract: "Other" };
    const r = verifySilverRecordReference({ path: "x", contentHash: a.contentHash, artifactSha256: a.provenance.artifactSha256 }, tampered);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("CANDIDATE_INVALID");
  });

  it("a target whose artifactJson no longer matches its own provenance digest is refused", () => {
    const a = compileRecord('{"contract":"A"}');
    const swappedBody = { ...a, artifactJson: '{"contract":"Z"}' };
    // Re-seal the swapped body so only the digest cross-check can catch it.
    swappedBody.contentHash = calculateContentHash(swappedBody, 4);
    const r = verifySilverRecordReference({ path: "x", contentHash: swappedBody.contentHash, artifactSha256: a.provenance.artifactSha256 }, swappedBody);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("SILVER_REFERENCE_DIGEST_MISMATCH");
  });
});
