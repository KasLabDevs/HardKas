import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { CURRENT_HASH_VERSION, calculateContentHash, readDeclaredHashVersion } from "../../src/canonical.js";
import { verifyArtifactIntegritySync } from "../../src/verify.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { createSimulatedSignedTxArtifact } from "../../src/signed-tx.js";

// Wave 1.1 · IC-4′.2–4 and D-Q1.e: `hashVersion` is an authenticated integer in
// 1..CURRENT; anything else fails closed in every mode (AUD-09 / P5 / R5 / R6);
// strict requires the current version (MIGRATION_REQUIRED); non-strict verifies
// legacy artifacts under their own rules and reports authScope LEGACY with the
// material fields that were never authenticated (N11 downgrade is detected).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

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

/** Re-hashes an artifact under a legacy version so its integrity holds under that version's rules. */
function asLegacy(artifact: any, version: number): any {
  const legacy = structuredClone(artifact);
  legacy.hashVersion = version;
  legacy.contentHash = calculateContentHash(legacy, version);
  if (legacy.lineage) legacy.lineage.artifactId = legacy.contentHash;
  return legacy;
}

describe("Wave 1.1 · hashVersion gate (IC-4′.2)", () => {
  it("readDeclaredHashVersion accepts only integers 1..CURRENT", () => {
    for (let v = 1; v <= CURRENT_HASH_VERSION; v++) expect(readDeclaredHashVersion({ hashVersion: v })).toBe(v);
    for (const bad of ["x", "4", 4.5, -1, 0, CURRENT_HASH_VERSION + 1, 99, null, undefined, true, {}, []]) {
      expect(readDeclaredHashVersion({ hashVersion: bad }), JSON.stringify(bad)).toBeNull();
    }
    expect(readDeclaredHashVersion({})).toBeNull();
  });

  it("T-P5 / T-R5: an invalid or missing hashVersion is HASH_VERSION_INVALID in strict and non-strict, and no legacy rule is applied", () => {
    const signed: any = createSimulatedSignedTxArtifact(makePlan(), "payload", ctx);
    for (const bad of ["x", "4", 4.5, -1, 0, 99, null, "absent"]) {
      const art = structuredClone(signed);
      if (bad === "absent") delete art.hashVersion;
      else art.hashVersion = bad;
      // The attacker self-certifies under the bogus version, exactly as the audit did.
      art.contentHash = calculateContentHash(art, bad as any);
      if (art.lineage) art.lineage.artifactId = art.contentHash;
      const tampered = structuredClone(art);
      tampered.lineage.parentArtifactId = "e".repeat(64);
      for (const strict of [true, false]) {
        for (const candidate of [art, tampered]) {
          const r = verifyArtifactIntegritySync(structuredClone(candidate), { strict });
          expect(r.ok, `hashVersion=${String(bad)} strict=${strict}`).toBe(false);
          expect(codes(r), `hashVersion=${String(bad)} strict=${strict}`).toContain("HASH_VERSION_INVALID");
          expect((r as any).authScope).toBe("NONE");
        }
      }
    }
  });

  it("T-R6 (control): a numeric legacy version is verified under its own rules; strict demands migration", () => {
    const signed: any = createSimulatedSignedTxArtifact(makePlan(), "payload", ctx);
    for (const version of [1, 4]) {
      const legacy = asLegacy(signed, version);
      const nonStrict = verifyArtifactIntegritySync(structuredClone(legacy), { strict: false });
      expect(nonStrict.ok, `v${version} non-strict`).toBe(true);
      expect((nonStrict as any).authScope).toBe("LEGACY");
      expect((nonStrict as any).unauthenticatedMaterialFields).toContain("status");
      const strict = verifyArtifactIntegritySync(structuredClone(legacy), { strict: true });
      expect(strict.ok, `v${version} strict`).toBe(false);
      expect(codes(strict)).toContain("MIGRATION_REQUIRED");
      expect(codes(strict)).not.toContain("HASH_VERSION_INVALID");
    }
  });

  it("a current-version artifact reports authScope FULL with no unauthenticated material fields", () => {
    const signed = createSimulatedSignedTxArtifact(makePlan(), "payload", ctx);
    for (const strict of [true, false]) {
      const r: any = verifyArtifactIntegritySync(structuredClone(signed), { strict });
      expect(r.ok).toBe(true);
      expect(r.authScope).toBe("FULL");
      expect(r.unauthenticatedMaterialFields).toEqual([]);
    }
  });

  it("T-N11: a v5-born artifact re-declared as v4 with fields added under the legacy exclusions is detected", () => {
    const plan: any = makePlan();
    const downgraded = structuredClone(plan);
    downgraded.hashVersion = 4; // contentHash kept: the attacker wants the original identity
    downgraded.status = "confirmed";
    downgraded.sourceSignedId = "signed-deadbeefdeadbeef";
    for (const strict of [true, false]) {
      const r = verifyArtifactIntegritySync(structuredClone(downgraded), { strict });
      expect(r.ok, `strict=${strict}`).toBe(false);
      expect(codes(r)).toContain(strict ? "MIGRATION_REQUIRED" : "ARTIFACT_HASH_MISMATCH");
    }
    // Recomputing the hash under v4 yields a different identity: the original artifact is not impersonated.
    const rehashed = structuredClone(downgraded);
    rehashed.contentHash = calculateContentHash(rehashed, 4);
    expect(rehashed.contentHash).not.toBe(plan.contentHash);
  });

  it("IC-4′.5: a derived label that does not match the recomputed hash is LABEL_MISMATCH in every mode", () => {
    const plan: any = makePlan();
    const relabelled = structuredClone(plan);
    relabelled.planId = "plan-0000000000000000";
    for (const strict of [true, false]) {
      const r = verifyArtifactIntegritySync(structuredClone(relabelled), { strict });
      expect(r.ok, `strict=${strict}`).toBe(false);
      expect(codes(r)).toContain("LABEL_MISMATCH");
    }
    const signed: any = createSimulatedSignedTxArtifact(plan, "payload", ctx);
    signed.signedId = "signed-0000000000000000";
    expect(codes(verifyArtifactIntegritySync(signed, { strict: false }))).toContain("LABEL_MISMATCH");
  });

  it("legacy artifacts keep their historical scope: a v4 status flip is reported as unauthenticated, never as verified", () => {
    const signed: any = createSimulatedSignedTxArtifact(makePlan(), "payload", ctx);
    const legacy = asLegacy(signed, 4);
    const flipped = structuredClone(legacy);
    flipped.status = "partially_signed";
    const r: any = verifyArtifactIntegritySync(flipped, { strict: false });
    // Integrity under v4 cannot see the flip (that is the historical scope) …
    expect(r.ok).toBe(true);
    // … and the result says so instead of claiming full authentication.
    expect(r.authScope).toBe("LEGACY");
    expect(r.unauthenticatedMaterialFields).toContain("status");
  });
});
