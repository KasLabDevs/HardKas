import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { CURRENT_HASH_VERSION, calculateContentHash } from "../../src/canonical.js";
import { verifyArtifactIntegritySync } from "../../src/verify.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { checkArtifactIdentity } from "../../src/resolve.js";

// Wave 1.3 · Closure Pack IC-4′ completion
//   .1  no schema skips verification (P6 / AUD-08: the ReplayReportV1 bypass);
//   .5  a version-5 artifact must not carry a top-level `artifactId`
//       → FORBIDDEN_IDENTITY_FIELD (IC-7.3); legacy artifacts keep their
//       historical copy and are reported as LEGACY, never as forbidden.

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

function makePlan(): any {
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

function sealV5(body: Record<string, unknown>): any {
  const a: any = { ...body, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  return a;
}

function sealV4(body: Record<string, unknown>): any {
  const a: any = { ...body, hashVersion: 4 };
  a.contentHash = calculateContentHash(a, 4);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  return a;
}

describe("Wave 1.3 · IC-4′.1 no schema skips verification (AUD-08 / T-P6)", () => {
  const replayReportBody = {
    schema: "hardkas.replayReport.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-09-25T00:00:00.000Z",
    txId: "simulated-" + "1".repeat(32),
    planOk: true,
    receiptOk: true,
    invariantsOk: true,
    checks: { workflowDeterministic: "reproduced", consensusValidation: "unimplemented", l2BridgeCorrectness: "unimplemented" },
    divergences: [],
    errors: []
  };

  it("a ReplayReportV1 without hashVersion/contentHash is NOT ok in any mode", () => {
    for (const strict of [false, true]) {
      const r = verifyArtifactIntegritySync(structuredClone(replayReportBody), { strict });
      expect(r.ok, `strict=${strict}`).toBe(false);
      expect(codes(r)).toContain("HASH_VERSION_INVALID");
    }
  });

  it("a ReplayReportV1 whose contentHash does not match is a hash mismatch, not a pass", () => {
    const sealed = sealV5(replayReportBody);
    sealed.invariantsOk = false; // flip a material field after sealing
    const r = verifyArtifactIntegritySync(sealed, { strict: true });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("ARTIFACT_HASH_MISMATCH");
  });

  it("a sealed ReplayReportV1 verifies like any other artifact (FULL scope)", () => {
    const sealed = sealV5(replayReportBody);
    const r = verifyArtifactIntegritySync(sealed, { strict: true });
    expect(r.ok, codes(r).join(",")).toBe(true);
    expect(r.authScope).toBe("FULL");
  });

  it("control: an unknown schema is an error in every mode", () => {
    const unknown = sealV5({ ...replayReportBody, schema: "hardkas.somethingElse.v9" });
    for (const strict of [false, true]) {
      const r = verifyArtifactIntegritySync(structuredClone(unknown), { strict });
      expect(r.ok, `strict=${strict}`).toBe(false);
      expect(codes(r)).toContain("ARTIFACT_SCHEMA_INVALID");
    }
  });
});

describe("Wave 1.3 · IC-7.3 / IC-4′.5 no top-level artifactId on version-5 artifacts", () => {
  it("a v5 plan with a top-level artifactId is FORBIDDEN_IDENTITY_FIELD, even when the hash covers it", () => {
    const plan = makePlan();
    const withCopy: any = { ...plan, artifactId: plan.contentHash };
    // Re-seal so the hash is consistent: the defect is the field itself, not a mismatch.
    withCopy.contentHash = calculateContentHash(withCopy, CURRENT_HASH_VERSION);
    withCopy.lineage = { ...withCopy.lineage, artifactId: withCopy.contentHash };
    withCopy.planId = `plan-${withCopy.contentHash.slice(0, 16)}`;
    for (const strict of [false, true]) {
      const r = verifyArtifactIntegritySync(structuredClone(withCopy), { strict });
      expect(r.ok, `strict=${strict}`).toBe(false);
      expect(codes(r), `strict=${strict}`).toContain("FORBIDDEN_IDENTITY_FIELD");
    }
  });

  it("the resolver's identity check refuses the same artifact (CANDIDATE_INVALID material)", () => {
    const plan = makePlan();
    const withCopy: any = { ...plan, artifactId: plan.contentHash };
    withCopy.contentHash = calculateContentHash(withCopy, CURRENT_HASH_VERSION);
    withCopy.lineage = { ...withCopy.lineage, artifactId: withCopy.contentHash };
    withCopy.planId = `plan-${withCopy.contentHash.slice(0, 16)}`;
    const check = checkArtifactIdentity(withCopy);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.issues.map((i) => i.code)).toContain("FORBIDDEN_IDENTITY_FIELD");
  });

  it("a v5 artifact with a top-level artifactId that is a label (not the hash) is refused for the same reason", () => {
    const record = sealV5({
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-25T00:00:00.000Z",
      decision: "ALLOW",
      rules: [],
      artifactId: "policy-0123456789abcdef"
    });
    const r = verifyArtifactIntegritySync(record, { strict: false });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("FORBIDDEN_IDENTITY_FIELD");
  });

  it("a legacy v4 artifact keeps its historical artifactId copy: LEGACY scope, never FORBIDDEN_IDENTITY_FIELD", () => {
    const legacy = sealV4({
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.12.0-rc.22",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-01T00:00:00.000Z",
      decision: "ALLOW",
      rules: []
    });
    legacy.artifactId = legacy.contentHash; // v4 excluded it by name; producers wrote it after hashing
    const relaxed = verifyArtifactIntegritySync(structuredClone(legacy), { strict: false });
    expect(relaxed.ok, codes(relaxed).join(",")).toBe(true);
    expect(relaxed.authScope).toBe("LEGACY");
    expect(codes(relaxed)).not.toContain("FORBIDDEN_IDENTITY_FIELD");
    expect(relaxed.unauthenticatedMaterialFields).toContain("artifactId");
    const strict = verifyArtifactIntegritySync(structuredClone(legacy), { strict: true });
    expect(strict.ok).toBe(false);
    expect(codes(strict)).toContain("MIGRATION_REQUIRED");
    expect(codes(strict)).not.toContain("FORBIDDEN_IDENTITY_FIELD");
  });

  it("a v5 artifact without the field is unaffected (control)", () => {
    const plan = makePlan();
    expect((plan as any).artifactId).toBeUndefined();
    const r = verifyArtifactIntegritySync(structuredClone(plan), { strict: true });
    expect(r.ok, codes(r).join(",")).toBe(true);
    expect(codes(r)).not.toContain("FORBIDDEN_IDENTITY_FIELD");
  });
});
