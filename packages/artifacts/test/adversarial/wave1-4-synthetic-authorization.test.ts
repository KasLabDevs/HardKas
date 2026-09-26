import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../../src/canonical.js";
import { verifyArtifactIntegritySync } from "../../src/verify.js";
import { checkArtifactIdentity } from "../../src/resolve.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { createSimulatedSignedTxArtifact } from "../../src/signed-tx.js";

// Wave 1.4 · Closure Pack D-Q2 (Q2-B) / IC-6′ / N4
//   IC-6′.1  the authorization references its plan by artifactId inside the authenticated body;
//   IC-6′.3  the signer identity lives in authenticated fields, never in signatureMetadata;
//   IC-6′.4  format `synthetic-authorization`, txId `synthetic-<planArtifactId>` (64 hex);
//            ONE synthetic txId scheme (N4: `simtx_` and `simulated-<label>-tx` are gone);
//            it is never presented as a signature.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
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
  }) as any;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "torture" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|mts|cts|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) yield full;
  }
}

describe("Wave 1.4 · synthetic authorization producer (IC-6′)", () => {
  it("binds to the plan by artifactId, names the signer in the authenticated body, and uses the single synthetic txId scheme", () => {
    const plan = makePlan();
    const signed: any = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    expect(signed.signedTransaction.format).toBe("synthetic-authorization");
    expect(signed.authorization).toEqual({ kind: "synthetic", planArtifactId: plan.contentHash, signers: [plan.from.address] });
    expect(signed.lineage.parentArtifactId).toBe(plan.contentHash);
    expect(signed.txId).toBe(`synthetic-${plan.contentHash}`);
    expect(signed.txId).toMatch(/^synthetic-[0-9a-f]{64}$/);
    expect(signed.signatureMetadata).toBeUndefined();
    expect(JSON.stringify(signed).toLowerCase()).not.toMatch(/simtx_|simulated-signed|"signature"/);
    const r = verifyArtifactIntegritySync(structuredClone(signed), { strict: true });
    expect(r.ok, codes(r).join(",")).toBe(true);
    expect(r.authScope).toBe("FULL");
  });

  it("the binding fields are authenticated: changing the plan reference, the signer or the format changes the identity", () => {
    const plan = makePlan();
    const signed: any = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    const other = makePlan(600n);
    for (const mutate of [
      (s: any) => { s.authorization.planArtifactId = other.contentHash; },
      (s: any) => { s.authorization.signers = ["kaspasim:qqmallory"]; },
      (s: any) => { s.authorization.kind = "signature"; },
      (s: any) => { s.signedTransaction.format = "simulated"; },
      (s: any) => { s.txId = `synthetic-${other.contentHash}`; },
      (s: any) => { s.lineage.parentArtifactId = other.contentHash; }
    ]) {
      const m = structuredClone(signed);
      mutate(m);
      expect(calculateContentHash(m, CURRENT_HASH_VERSION)).not.toBe(signed.contentHash);
      expect(checkArtifactIdentity(m).ok).toBe(false);
    }
  });

  it("refuses to authorize for a signer that is not the plan's `from` (SIGNER_MISMATCH) and refuses an unsealed plan", () => {
    const plan = makePlan();
    let error: any;
    try {
      createSimulatedSignedTxArtifact(plan, "kaspasim:qqmallory", ctx);
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe("SIGNER_MISMATCH");
    const unsealed: any = { ...plan };
    delete unsealed.contentHash;
    let error2: any;
    try {
      createSimulatedSignedTxArtifact(unsealed, plan.from.address, ctx);
    } catch (e) {
      error2 = e;
    }
    expect(error2?.code).toBe("PLAN_UNIDENTIFIED");
  });

  it("an account object with the plan's address is accepted and its name is recorded only as metadata of the authorization", () => {
    const plan = makePlan();
    const signed: any = createSimulatedSignedTxArtifact(plan, { address: plan.from.address, accountName: "alice" }, ctx);
    expect(signed.authorization.signers).toEqual([plan.from.address]);
    expect(signed.from.address).toBe(plan.from.address);
  });

  it("N4 · no source builds a `simtx_` or `simulated-<label>-tx` identifier or a `simulated` signed format", () => {
    const allowed = new Set<string>([
      // legacy-shape CLASSIFICATION for NAMESPACE_REQUIRED hints (recognises old ids, never produces them)
      "packages/artifacts/src/resolve.ts"
    ]);
    const offenders: string[] = [];
    const packagesDir = path.join(ROOT, "packages");
    for (const pkg of readdirSync(packagesDir)) {
      const src = path.join(packagesDir, pkg, "src");
      let isDir = false;
      try { isDir = statSync(src).isDirectory(); } catch { isDir = false; }
      if (!isDir) continue;
      for (const file of walk(src)) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (allowed.has(rel)) continue;
        const text = readFileSync(file, "utf8");
        if (/`simtx_|"simtx_|'simtx_/.test(text)) offenders.push(`${rel}: simtx_ builder`);
        if (/`simulated-\$\{[^`]*\}-tx`/.test(text)) offenders.push(`${rel}: simulated-<label>-tx builder`);
        if (/format:\s*"simulated"/.test(text)) offenders.push(`${rel}: format "simulated"`);
        if (/simulated-signed-tx:/.test(text)) offenders.push(`${rel}: simulated-signed-tx payload`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
