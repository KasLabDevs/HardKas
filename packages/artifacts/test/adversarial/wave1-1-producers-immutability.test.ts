import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { CURRENT_HASH_VERSION, V5_UNAUTHENTICATED, V5_DERIVED_LABELS, calculateContentHash } from "../../src/canonical.js";
import { verifyArtifactIntegritySync } from "../../src/verify.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { createSimulatedSignedTxArtifact, createSimulatedTxReceipt } from "../../src/signed-tx.js";
import { generateMigrationReceipt } from "../../src/migration.js";
import { createDeploymentRecord, updateDeploymentStatus } from "../../src/deployment.js";
import { verifyLineage } from "../../src/lineage.js";

// Wave 1.1 · IC-1′.4 (no field of the authenticated body changes after hashing),
// IC-1′.3 (every producer writes hashVersion before hashing), IC-1′.5 / D-Q1.d
// (a root artifact stores no self-referential lineage fields; no two-pass hashing).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

function makePlan(amount = 500n, overrides: Partial<Parameters<typeof createTxPlanArtifact>[0]> = {}) {
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
    plan,
    ...overrides
  });
}

function expectSelfConsistent(artifact: any, label: string) {
  expect(artifact.hashVersion, `${label}.hashVersion`).toBe(CURRENT_HASH_VERSION);
  expect(typeof artifact.contentHash, `${label}.contentHash`).toBe("string");
  expect(calculateContentHash(artifact, artifact.hashVersion), `${label} hash(written) == hash(declared)`).toBe(artifact.contentHash);
  const r = verifyArtifactIntegritySync(structuredClone(artifact), { strict: false });
  expect(r.ok, `${label} verifies: ${codes(r).join(",")}`).toBe(true);
}

describe("Wave 1.1 · producers are self-consistent and immutable after hashing", () => {
  it("plan, signed and receipt from @hardkas/artifacts verify as produced, in strict mode", () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    const receipt = createSimulatedTxReceipt(plan, "simtx_" + "1".repeat(32), ctx, { parentArtifact: signed as typeof signed & { contentHash: string }, sourceSignedId: signed.signedId });
    for (const [label, artifact] of Object.entries({ plan, signed, receipt })) {
      expectSelfConsistent(artifact, label);
      expect(verifyArtifactIntegritySync(structuredClone(artifact), { strict: true }).ok, `${label} strict`).toBe(true);
    }
  });

  it("every authenticated top-level field of plan, signed and receipt is covered by the hash (mutation matrix)", () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    const receipt = createSimulatedTxReceipt(plan, "simtx_" + "1".repeat(32), ctx, { parentArtifact: signed as typeof signed & { contentHash: string }, sourceSignedId: signed.signedId });
    const skip = new Set<string>([...V5_UNAUTHENTICATED, ...V5_DERIVED_LABELS, "contentHash"]);
    for (const [label, artifact] of Object.entries({ plan, signed, receipt })) {
      for (const key of Object.keys(artifact as any)) {
        if (skip.has(key)) continue;
        const mutated: any = structuredClone(artifact);
        const value = mutated[key];
        mutated[key] = typeof value === "string" ? value + "x" : typeof value === "number" ? value + 1 : { tampered: true, was: value };
        const r = verifyArtifactIntegritySync(mutated, { strict: false });
        expect(r.ok, `${label}.${key} mutation must be detected`).toBe(false);
      }
      // Unauthenticated operational fields may change without touching identity …
      for (const key of Object.keys(artifact as any)) {
        if (!V5_UNAUTHENTICATED.has(key)) continue;
        const mutated: any = structuredClone(artifact);
        mutated[key] = "changed";
        expect(calculateContentHash(mutated, CURRENT_HASH_VERSION), `${label}.${key} is operational`).toBe((artifact as any).contentHash);
      }
    }
  });

  it("IC-1′.5 / D-Q1.d: a root plan stores no self-referential lineage fields and derives nothing from its own hash", () => {
    const plan: any = makePlan();
    expect(plan.lineage.artifactId).toBe(plan.contentHash);
    expect(plan.lineage.parentArtifactId).toBeUndefined();
    expect(plan.lineage.lineageId).toBeUndefined();
    expect(plan.lineage.rootArtifactId).toBeUndefined();
    expect(plan.workflowId).toBeDefined();
    expect(plan.workflowId).not.toContain(plan.contentHash.slice(0, 16));
    // The identity is single-pass: hashing the artifact as stored reproduces it.
    expect(calculateContentHash(plan, CURRENT_HASH_VERSION)).toBe(plan.contentHash);
    expect(verifyLineage(plan, undefined, { strict: true }).ok).toBe(true);
  });

  it("the default workflowId is a function of the intent, not of the artifact hash", () => {
    const a: any = makePlan(500n);
    const b: any = makePlan(500n);
    const c: any = makePlan(600n);
    expect(a.workflowId).toBe(b.workflowId);
    expect(a.workflowId).not.toBe(c.workflowId);
    const explicit: any = makePlan(500n, { ctx: { ...ctx, workflowId: "wf_explicit0000000" } });
    expect(explicit.workflowId).toBe("wf_explicit0000000");
  });

  it("children reference the root's real artifactId (rootArtifactId = lineageId = root.contentHash) and chain strictly", () => {
    const plan: any = makePlan();
    const signed: any = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    expect(signed.lineage.parentArtifactId).toBe(plan.contentHash);
    expect(signed.lineage.rootArtifactId).toBe(plan.contentHash);
    expect(signed.lineage.lineageId).toBe(plan.contentHash);
    expect(verifyLineage(signed, plan, { strict: true }).ok).toBe(true);
    const receipt: any = createSimulatedTxReceipt(plan, "simtx_" + "1".repeat(32), ctx, { parentArtifact: signed, sourceSignedId: signed.signedId });
    expect(receipt.lineage.parentArtifactId).toBe(signed.contentHash);
    expect(receipt.lineage.rootArtifactId).toBe(plan.contentHash);
    expect(verifyLineage(receipt, signed, { strict: true }).ok).toBe(true);
    // A root that carries self-referential fields is refused under the current version.
    const selfRef: any = structuredClone(plan);
    selfRef.lineage.lineageId = selfRef.contentHash;
    selfRef.lineage.rootArtifactId = selfRef.contentHash;
    selfRef.contentHash = calculateContentHash(selfRef, CURRENT_HASH_VERSION);
    selfRef.lineage.artifactId = selfRef.contentHash;
    expect(codes(verifyLineage(selfRef, undefined, { strict: true }))).toContain("LINEAGE_ROOT_SELF_REFERENCE");
  });

  it("migration-receipt and deployment producers write hashVersion before hashing and stay self-consistent", () => {
    // Re-issuing a legacy artifact under the current version is D-Q1.f (Wave 1.3);
    // here the receipt producer is exercised with two already-sealed artifacts.
    const oldPlan: any = makePlan(500n);
    const newPlan: any = makePlan(501n);
    const receipt = generateMigrationReceipt(oldPlan, newPlan, "wave1-1");
    expectSelfConsistent(receipt, "migrationReceipt");
    expect(receipt.lineage.artifactId).toBe(receipt.contentHash);
    expect(receipt.lineage.parentArtifactId).toBe(oldPlan.contentHash);
    const record = createDeploymentRecord({ label: "demo", networkId: asNetworkId("simnet") as any });
    expect(record.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(calculateContentHash(record, record.hashVersion as number)).toBe(record.contentHash);
    const updated = updateDeploymentStatus(record, "sent", "ab".repeat(32) as any);
    expect(updated.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(calculateContentHash(updated, updated.hashVersion as number)).toBe(updated.contentHash);
  });

});
