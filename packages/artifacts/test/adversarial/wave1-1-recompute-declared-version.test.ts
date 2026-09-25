import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { CURRENT_HASH_VERSION, calculateContentHash, recomputeDeclaredContentHash } from "../../src/canonical.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { HashInvariant } from "../../src/invariants/definitions.js";

// Wave 1.1 · N7 (recompute half, IC-1′.8): outside a producer, a content hash is
// recomputed with ONE verification function and the DECLARED version. A bare
// `calculateContentHash(x)` (implicit current version) outside the producer
// allow-list is a defect: it turns every legacy artifact into a false mismatch
// the moment the current version moves.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

function makeV4Plan(): any {
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: 500n }],
    change: { address: "kaspasim:qqalice", amountSompi: 490n },
    estimatedFeeSompi: 10n,
    estimatedMass: 100n
  };
  const current: any = createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: 500n,
    plan
  });
  const legacy = structuredClone(current);
  legacy.hashVersion = 4;
  legacy.lineage.lineageId = "0".repeat(64);
  legacy.lineage.rootArtifactId = "0".repeat(64);
  legacy.contentHash = calculateContentHash(legacy, 4);
  legacy.lineage.artifactId = legacy.contentHash;
  return legacy;
}

/** Source files whose bare calls are the producer itself or a domain digest pinned elsewhere. */
const ALLOWED_BARE_CALLS = new Set<string>([
  // the canonicaliser's own definition
  "packages/artifacts/src/canonical.ts"
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "torture" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|mts|cts|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) yield full;
  }
}

describe("Wave 1.1 · recompute with the declared hash version (N7)", () => {
  it("recomputeDeclaredContentHash uses the artifact's declared version, so legacy artifacts do not turn into false mismatches", () => {
    const legacy = makeV4Plan();
    expect(CURRENT_HASH_VERSION).not.toBe(4);
    expect(recomputeDeclaredContentHash(legacy)).toBe(legacy.contentHash);
    expect(calculateContentHash(legacy, CURRENT_HASH_VERSION)).not.toBe(legacy.contentHash);
    expect(() => recomputeDeclaredContentHash({ ...legacy, hashVersion: "x" })).toThrow(/HASH_VERSION_INVALID/);
  });

  it("the hash invariant checker recomputes with the declared version", async () => {
    const legacy = makeV4Plan();
    const invariant = new HashInvariant();
    expect(await invariant.check({ artifact: legacy } as any)).toEqual([]);
    const tampered = { ...legacy, amountSompi: "1" };
    expect((await invariant.check({ artifact: tampered } as any)).map((v) => v.code)).toEqual(["INVAR_HASH_MATCH"]);
    const undeclared = { ...legacy, hashVersion: "x" };
    expect((await invariant.check({ artifact: undeclared } as any))[0]?.message).toMatch(/HASH_VERSION_INVALID/);
  });

  it("no source outside the producer allow-list recomputes a hash with an implicit version", () => {
    const offenders: string[] = [];
    const packagesDir = path.join(ROOT, "packages");
    for (const pkg of readdirSync(packagesDir)) {
      const src = path.join(packagesDir, pkg, "src");
      let isDir = false;
      try { isDir = statSync(src).isDirectory(); } catch { isDir = false; }
      if (!isDir) continue;
      for (const file of walk(src)) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (ALLOWED_BARE_CALLS.has(rel)) continue;
        const text = readFileSync(file, "utf8");
        // A call whose argument list holds no top-level comma: calculateContentHash(expr)
        const re = /calculateContentHash\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const args = m[1] ?? "";
          let depth = 0;
          let hasComma = false;
          for (const ch of args) {
            if (ch === "(" || ch === "[" || ch === "{") depth++;
            else if (ch === ")" || ch === "]" || ch === "}") depth--;
            else if (ch === "," && depth === 0) { hasComma = true; break; }
          }
          if (!hasComma) offenders.push(`${rel}: calculateContentHash(${args.trim().slice(0, 40)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
