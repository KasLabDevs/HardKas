import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { calculateContentHash, canonicalStringify } from "../../src/canonical.js";
import * as artifacts from "../../src/index.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";

// Wave 1.3 · Closure Pack IC-1′.7 (N7, digest half) and IC-7.4
//   IC-1′.7  domain digests (stateHash, utxoSetHash, accountsHash, intentHash, …)
//            are computed by a dedicated canonical digest function WITHOUT
//            exclusions and with its own algorithm version; never with
//            calculateContentHash. The v≤4 digests are kept only for legacy replay.
//   IC-7.4   one name, one derivation: `workflowId` is derived by ONE function
//            over a typed intent, respecting IC-1′.5 (never from the artifact's own hash).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "torture" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|mts|cts|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) yield full;
  }
}

function* sourceFiles(): Generator<{ rel: string; text: string }> {
  const packagesDir = path.join(ROOT, "packages");
  for (const pkg of readdirSync(packagesDir)) {
    const src = path.join(packagesDir, pkg, "src");
    let isDir = false;
    try { isDir = statSync(src).isDirectory(); } catch { isDir = false; }
    if (!isDir) continue;
    for (const file of walk(src)) {
      yield { rel: path.relative(ROOT, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") };
    }
  }
}

describe("Wave 1.3 · IC-1′.7 dedicated domain-digest function", () => {
  const api = artifacts as any;

  it("exports domainDigest with its own algorithm version, distinct from the artifact hash version", () => {
    expect(typeof api.domainDigest).toBe("function");
    expect(typeof api.CURRENT_DOMAIN_DIGEST_VERSION).toBe("number");
    expect(typeof api.legacyDomainDigest).toBe("function");
    expect(typeof api.domainDigestVersionFor).toBe("function");
  });

  it("has NO exclusions: every key at every depth is part of the digest (names v4/v5 exclude included)", () => {
    const base = { a: 1, status: "x", contentHash: "h", createdAt: "t", nested: { rpcUrl: "u", artifactId: "i" } };
    const d0 = api.domainDigest(base);
    for (const mutate of [
      (o: any) => { o.status = "y"; },
      (o: any) => { o.contentHash = "g"; },
      (o: any) => { o.createdAt = "s"; },
      (o: any) => { o.nested.rpcUrl = "v"; },
      (o: any) => { o.nested.artifactId = "j"; },
      (o: any) => { delete o.contentHash; }
    ]) {
      const m = structuredClone(base);
      mutate(m);
      expect(api.domainDigest(m)).not.toBe(d0);
    }
    // Key order is irrelevant; bigint is typed.
    expect(api.domainDigest({ b: 2n, a: "1" })).toBe(api.domainDigest({ a: "1", b: 2n }));
    expect(api.domainDigest({ a: 1n })).not.toBe(api.domainDigest({ a: "1" }));
  });

  it("differs from calculateContentHash whenever an excluded name is present, and is not the v4 canonical form", () => {
    const value = { status: "accepted", txId: "t" };
    expect(api.domainDigest(value)).not.toBe(calculateContentHash(value, 4));
    // The frozen legacy digest IS the v4 canonical form, kept only for legacy replay.
    expect(api.legacyDomainDigest(value)).toBe(calculateContentHash(value, 4));
  });

  it("selects the algorithm by the containing artifact's hashVersion: legacy for ≤4, current for 5", () => {
    expect(api.domainDigestVersionFor(4)).toBe("legacy");
    expect(api.domainDigestVersionFor(1)).toBe("legacy");
    expect(api.domainDigestVersionFor(5)).toBe(api.CURRENT_DOMAIN_DIGEST_VERSION);
    expect(() => api.domainDigestVersionFor("x")).toThrow(/HASH_VERSION_INVALID/);
  });

  it("no source uses calculateContentHash or canonicalStringify with a numeric literal version (N7)", () => {
    const allowed = new Set([
      "packages/artifacts/src/canonical.ts",
      "packages/artifacts/src/domain-digest.ts",
      // Test-fixture producer of deliberately LEGACY (v3) artifacts: the literal is its purpose.
      "packages/testing/src/adversarial-fixtures.ts"
    ]);
    const offenders: string[] = [];
    for (const { rel, text } of sourceFiles()) {
      if (allowed.has(rel)) continue;
      const re = /(calculateContentHash|canonicalStringify)\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const args = m[2] ?? "";
        // last top-level argument
        let depth = 0;
        let last = "";
        let current = "";
        for (const ch of args) {
          if (ch === "(" || ch === "[" || ch === "{") depth++;
          else if (ch === ")" || ch === "]" || ch === "}") depth--;
          if (ch === "," && depth === 0) { current = ""; continue; }
          current += ch;
        }
        last = current.trim();
        if (/^\d+$/.test(last)) offenders.push(`${rel}: ${m[1]}(…, ${last})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no source defines its own canonicaliser or a local CURRENT_HASH_VERSION", () => {
    // PSKT portable-session digests keep their pre-existing key-sorted JSON form:
    // switching them to domainDigest would re-key every persisted session's
    // integrityHash. Outside IC-1′.7's list (not an artifact digest); flagged as AUX.
    const allowed = new Set(["packages/artifacts/src/canonical.ts", "packages/sdk/src/pskt.ts"]);
    const offenders: string[] = [];
    for (const { rel, text } of sourceFiles()) {
      if (allowed.has(rel)) continue;
      if (/^\s*(export\s+)?const\s+CURRENT_HASH_VERSION\s*=/m.test(text)) offenders.push(`${rel}: local CURRENT_HASH_VERSION`);
      if (/^\s*function\s+canonicalStringify\s*\(/m.test(text)) offenders.push(`${rel}: local canonicalStringify`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Wave 1.3 · IC-7.4 single workflowId derivation", () => {
  const api = artifacts as any;

  it("exports deriveWorkflowId over a typed intent: wf_ + 16 hex, a function of the intent only", () => {
    expect(typeof api.deriveWorkflowId).toBe("function");
    const transfer = { kind: "transfer", networkId: "simnet", mode: "simulator", fromAddress: "a", toAddress: "b", amountSompi: "1", outpoints: [{ transactionId: "ab".repeat(32), index: 0 }] };
    const id1 = api.deriveWorkflowId(transfer);
    expect(id1).toMatch(/^wf_[0-9a-f]{16}$/);
    expect(api.deriveWorkflowId(structuredClone(transfer))).toBe(id1);
    expect(api.deriveWorkflowId({ ...transfer, amountSompi: "2" })).not.toBe(id1);
    const steps = { kind: "steps", steps: [{ type: "tx.plan" }], normalizedInputs: {}, parentArtifacts: [], policySnapshot: {}, capabilitySnapshot: {}, runtimeVersion: "0.12.0-rc.23", workspaceSchemaVersion: "hardkas.workflow.v1" };
    expect(api.deriveWorkflowId(steps)).toMatch(/^wf_[0-9a-f]{16}$/);
    expect(api.deriveWorkflowId(steps)).not.toBe(id1);
    expect(() => api.deriveWorkflowId({ networkId: "simnet" })).toThrow(/WORKFLOW_INTENT_INVALID/);
  });

  it("the derivation uses the domain digest (no exclusions), never the artifact hash", () => {
    const transfer = { kind: "transfer", networkId: "simnet", mode: "simulator", fromAddress: "a", toAddress: "b", amountSompi: "1", outpoints: [] };
    // A field the artifact canonicaliser would exclude still changes the intent digest.
    const withStatus = { ...transfer, status: "x" };
    expect(api.deriveWorkflowId(withStatus)).not.toBe(api.deriveWorkflowId(transfer));
    expect(api.deriveWorkflowId(transfer)).toBe(`wf_${api.domainDigest(transfer).slice(0, 16)}`);
    // The artifact canonical form (v4 drops `status` by name) is NOT the derivation.
    expect(api.deriveWorkflowId(withStatus)).not.toBe(`wf_${calculateContentHash(withStatus, 4).slice(0, 16)}`);
  });

  it("a root plan's default workflowId is the single derivation over its transfer intent", () => {
    const plan: any = {
      inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
      outputs: [{ address: "kaspasim:qqbob", amountSompi: 500n }],
      change: { address: "kaspasim:qqalice", amountSompi: 490n },
      estimatedFeeSompi: 10n,
      estimatedMass: 100n
    };
    const artifact: any = createTxPlanArtifact({
      ctx,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
      to: { input: "bob", address: "kaspasim:qqbob" },
      amountSompi: 500n,
      plan
    });
    const expected = api.deriveWorkflowId({
      kind: "transfer",
      networkId: "simnet",
      mode: "simulator",
      fromAddress: "kaspasim:qqalice",
      toAddress: "kaspasim:qqbob",
      amountSompi: "500",
      outpoints: [{ transactionId: "ab".repeat(32), index: 0 }]
    });
    expect(artifact.workflowId).toBe(expected);
    expect(artifact.workflowId).not.toContain(artifact.contentHash.slice(0, 16));
  });

  it("no source builds a `wf_` identifier outside deriveWorkflowId", () => {
    const offenders: string[] = [];
    for (const { rel, text } of sourceFiles()) {
      if (rel === "packages/artifacts/src/workflow-id.ts") continue;
      if (/`wf_\$\{/.test(text) || /"wf_"\s*\+/.test(text) || /'wf_'\s*\+/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("legacy check: canonicalStringify with an explicit version is still available to the verifier", () => {
    expect(canonicalStringify({ a: 1 }, 4)).toBe('{"a":1}');
  });
});
