import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import * as schemas from "../../src/schemas.js";
import {
  CURRENT_HASH_VERSION,
  V5_UNAUTHENTICATED,
  V5_DERIVED_LABELS,
  calculateContentHash,
  canonicalStringify
} from "../../src/canonical.js";
import { verifyArtifactIntegritySync } from "../../src/verify.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { createSimulatedSignedTxArtifact, createSimulatedTxReceipt } from "../../src/signed-tx.js";

// Wave 1.1 · Q1-B′ (Closure Pack IC-1′): the content hash authenticates the whole
// artifact except (a) exact-path self references, (b) a closed top-level list of
// operational fields, (c) the derived labels the verifier recomputes. Nothing is
// excluded by key name at depth any more (AUD-11 / P1 / P2 / P3 / R1–R3 / N1).

const CLOSURE_PACK_V5_UNAUTHENTICATED = [
  "createdAt", "submittedAt", "confirmedAt", "deployedAt", "executionId", "tracePath", "receiptPath",
  "filePath", "file_path", "workspacePath", "debug", "logs", "uiHints", "cache", "lastViewedAt",
  "indexedAt", "file_mtime_ms", "latencyMs", "rpcHost", "rpcUrl", "hardkasVersion", "signatureMetadata"
];

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
    ctx: { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } },
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: amount,
    plan
  });
}

describe("Wave 1.1 · v5 canonicalisation authenticates material fields (AUD-11)", () => {
  it("T-P1: status is part of the hash at the top level under the current version (legacy v4 still ignores it)", () => {
    const a = { schema: "x", hashVersion: CURRENT_HASH_VERSION, v: 1, status: "failed" };
    const b = { schema: "x", hashVersion: CURRENT_HASH_VERSION, v: 1, status: "confirmed" };
    expect(calculateContentHash(a, CURRENT_HASH_VERSION)).not.toBe(calculateContentHash(b, CURRENT_HASH_VERSION));
    // Legacy rule preserved byte for byte so v4 artifacts keep verifying.
    expect(calculateContentHash(a, 4)).toBe(calculateContentHash(b, 4));
  });

  it("T-P2: no exclusion by key name at depth (nested status/cache/logs are authenticated)", () => {
    const a = { schema: "x", hashVersion: CURRENT_HASH_VERSION, result: { status: "failed", cache: 1, logs: ["a"] } };
    const b = { schema: "x", hashVersion: CURRENT_HASH_VERSION, result: { status: "passed", cache: 999, logs: ["zzz"] } };
    expect(calculateContentHash(a, CURRENT_HASH_VERSION)).not.toBe(calculateContentHash(b, CURRENT_HASH_VERSION));
    expect(calculateContentHash(a, 4)).toBe(calculateContentHash(b, 4));
  });

  it("T-N1b: a nested reference contentHash is authenticated (Silver-style {path, contentHash} references)", () => {
    const a = { schema: "hardkas.silverDeploy.v1", hashVersion: CURRENT_HASH_VERSION, compileRecord: { path: "c.json", contentHash: "a".repeat(64) } };
    const b = { schema: "hardkas.silverDeploy.v1", hashVersion: CURRENT_HASH_VERSION, compileRecord: { path: "c.json", contentHash: "b".repeat(64) } };
    expect(calculateContentHash(a, CURRENT_HASH_VERSION)).not.toBe(calculateContentHash(b, CURRENT_HASH_VERSION));
    expect(calculateContentHash(a, 4)).toBe(calculateContentHash(b, 4));
  });

  it("hashVersion itself is authenticated (IC-1′.3)", () => {
    const a = { schema: "x", hashVersion: CURRENT_HASH_VERSION, v: 1 };
    const b = { schema: "x", hashVersion: 4, v: 1 };
    expect(calculateContentHash(a, CURRENT_HASH_VERSION)).not.toBe(calculateContentHash(b, CURRENT_HASH_VERSION));
  });

  it("only exact-path self references are excluded: top-level contentHash and lineage.artifactId, never a nested contentHash", () => {
    const base: any = { schema: "x", hashVersion: CURRENT_HASH_VERSION, lineage: { artifactId: "", sequence: 1 }, child: { contentHash: "1".repeat(64) } };
    const withSelf = { ...base, contentHash: "f".repeat(64), lineage: { ...base.lineage, artifactId: "f".repeat(64) } };
    expect(calculateContentHash(withSelf, CURRENT_HASH_VERSION)).toBe(calculateContentHash(base, CURRENT_HASH_VERSION));
    const nested = { ...base, child: { contentHash: "2".repeat(64) } };
    expect(calculateContentHash(nested, CURRENT_HASH_VERSION)).not.toBe(calculateContentHash(base, CURRENT_HASH_VERSION));
    // A lineage.artifactId at depth 2 or a lineage that is not the root's is authenticated.
    const deep = { ...base, wrapper: { lineage: { artifactId: "9".repeat(64) } } };
    const deep2 = { ...base, wrapper: { lineage: { artifactId: "8".repeat(64) } } };
    expect(calculateContentHash(deep, CURRENT_HASH_VERSION)).not.toBe(calculateContentHash(deep2, CURRENT_HASH_VERSION));
  });

  it("the derived labels planId/signedId are excluded from the hash (the verifier recomputes them, IC-4′.5)", () => {
    const a = { schema: "hardkas.txPlan", hashVersion: CURRENT_HASH_VERSION, planId: "plan-0000000000000000", signedId: "signed-0000000000000000", v: 1 };
    const b = { ...a, planId: "plan-ffffffffffffffff", signedId: "signed-ffffffffffffffff" };
    expect(calculateContentHash(a, CURRENT_HASH_VERSION)).toBe(calculateContentHash(b, CURRENT_HASH_VERSION));
    expect([...V5_DERIVED_LABELS].sort()).toEqual(["planId", "signedId"]);
  });

  it("the unauthenticated list is exactly the ratified closed list and applies only at the top level", () => {
    expect([...V5_UNAUTHENTICATED].sort()).toEqual([...CLOSURE_PACK_V5_UNAUTHENTICATED].sort());
    for (const name of V5_UNAUTHENTICATED) {
      const top = { schema: "x", hashVersion: CURRENT_HASH_VERSION, [name]: "one" };
      const top2 = { schema: "x", hashVersion: CURRENT_HASH_VERSION, [name]: "two" };
      expect(calculateContentHash(top, CURRENT_HASH_VERSION), `${name} at top level`).toBe(calculateContentHash(top2, CURRENT_HASH_VERSION));
      const nested = { schema: "x", hashVersion: CURRENT_HASH_VERSION, inner: { [name]: "one" } };
      const nested2 = { schema: "x", hashVersion: CURRENT_HASH_VERSION, inner: { [name]: "two" } };
      expect(calculateContentHash(nested, CURRENT_HASH_VERSION), `${name} nested`).not.toBe(calculateContentHash(nested2, CURRENT_HASH_VERSION));
    }
  });

  it("fields that v4 dropped by name are authenticated in v5: status, sourceSignedId, dagContext, events, artifactId, parentArtifactId", () => {
    for (const name of ["status", "sourceSignedId", "dagContext", "events", "artifactId", "parentArtifactId"]) {
      const a = { schema: "x", hashVersion: CURRENT_HASH_VERSION, [name]: "one" };
      const b = { schema: "x", hashVersion: CURRENT_HASH_VERSION, [name]: "two" };
      expect(calculateContentHash(a, CURRENT_HASH_VERSION), name).not.toBe(calculateContentHash(b, CURRENT_HASH_VERSION));
    }
  });

  it("IC-1′.6: no exported Zod schema declares a top-level field from the unauthenticated list beyond the acknowledged set", () => {
    const acknowledged = new Set<string>();
    for (const [name, value] of Object.entries(schemas)) {
      const shape = (value as any)?.shape;
      if (!shape || typeof shape !== "object") continue;
      for (const key of Object.keys(shape)) if (V5_UNAUTHENTICATED.has(key)) acknowledged.add(`${name}.${key}`);
    }
    // Every entry here is an operational field a schema legitimately declares
    // (timestamps, paths, transport locator, tool version, signer notes). Adding a
    // schema field whose name collides with the list makes this snapshot change,
    // which is the review trigger the contract asks for.
    expect([...acknowledged].sort()).toMatchSnapshot();
  });

  it("T-P3 / T-R3: flipping status on a schema-valid signed artifact breaks verification in every mode", () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address,{ ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } });
    expect(verifyArtifactIntegritySync(structuredClone(signed), { strict: true }).ok).toBe(true);
    const tampered: any = structuredClone(signed);
    tampered.status = "partially_signed";
    for (const strict of [true, false]) {
      const r = verifyArtifactIntegritySync(tampered, { strict });
      expect(r.ok, `strict=${strict}`).toBe(false);
      expect(codes(r)).toContain("ARTIFACT_HASH_MISMATCH");
    }
  });

  it("T-R1 / T-R2: receipt status flip and sourceSignedId re-pointing break verification", () => {
    const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address,ctx);
    const receipt = createSimulatedTxReceipt(plan, "simtx_" + "1".repeat(32), ctx, {
      parentArtifact: signed as typeof signed & { contentHash: string },
      sourceSignedId: signed.signedId,
      preStateHash: "a".repeat(64),
      postStateHash: "b".repeat(64)
    });
    expect(verifyArtifactIntegritySync(structuredClone(receipt), { strict: true }).ok).toBe(true);
    const flipped: any = structuredClone(receipt);
    flipped.status = "failed";
    expect(verifyArtifactIntegritySync(flipped, { strict: false }).ok).toBe(false);
    const repointed: any = structuredClone(receipt);
    repointed.sourceSignedId = "signed-deadbeefdeadbeef";
    expect(verifyArtifactIntegritySync(repointed, { strict: false }).ok).toBe(false);
  });

  it("canonical strings of versions 1 to 4 are unchanged (legacy artifacts stay verifiable)", () => {
    const sample = { schema: "x", hashVersion: 4, status: "s", nested: { status: "n", value: 1n }, createdAt: "t" };
    expect(canonicalStringify(sample, 4)).toBe('{"nested":{"value":"n:1"},"schema":"x"}');
    expect(canonicalStringify(sample, 3)).toBe('{"nested":{"value":"n:1"},"schema":"x"}');
    expect(canonicalStringify(sample, 1)).toBe('{"nested":{"value":"1"},"schema":"x"}');
  });
});
