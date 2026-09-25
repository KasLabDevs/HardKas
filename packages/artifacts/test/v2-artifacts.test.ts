import { describe, it, expect } from "vitest";
import {
  canonicalStringify,
  calculateContentHash,
  verifyArtifact,
  migrateToCanonical,
  sortUtxosByOutpoint,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION
} from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Artifacts - Determinism and Verification", () => {
  it("should produce the same hash for same object with different key order", () => {
    const obj1 = { a: 1, b: 2, c: { d: 3, e: 4 } };
    const obj2 = { c: { e: 4, d: 3 }, b: 2, a: 1 };

    const hash1 = calculateContentHash(obj1);
    const hash2 = calculateContentHash(obj2);

    expect(hash1).toBe(hash2);
    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
  });

  it("should produce the same hash/string when undefined fields are present vs absent", () => {
    const withoutUndefined = { a: 1 };
    const withUndefined = { a: 1, b: undefined };

    expect(canonicalStringify(withoutUndefined)).toBe(canonicalStringify(withUndefined));
    expect(calculateContentHash(withoutUndefined)).toBe(
      calculateContentHash(withUndefined)
    );
  });

  it("should exclude contentHash from canonical stringify", () => {
    const obj = { a: 1, contentHash: "some-hash" };
    const canonical = canonicalStringify(obj);
    expect(canonical).not.toContain("contentHash");
    expect(canonical).toBe('{"a":1}');
  });

  it("should change hash when data changes (1-sompi mutation)", () => {
    const tx = { amountSompi: "1000" };
    const txMutated = { amountSompi: "1001" };

    const hash1 = calculateContentHash(tx);
    const hash2 = calculateContentHash(txMutated);

    expect(hash1).not.toBe(hash2);
  });

  it("should sort UTXOs by outpoint deterministically", () => {
    const utxos = [
      { id: "tx2:0", amount: "10" },
      { id: "tx1:1", amount: "20" },
      { id: "tx1:0", amount: "30" }
    ];

    const sorted = sortUtxosByOutpoint(utxos);
    expect(sorted[0]!.id).toBe("tx1:0");
    expect(sorted[1]!.id).toBe("tx1:1");
    expect(sorted[2]!.id).toBe("tx2:0");
  });

  it("should verify a valid canonical artifact", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    const artifactPath = path.join(tempDir, "test.json");

    const artifact: any = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.12.0-rc.23",
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: new Date().toISOString(),
      networkId: "simnet",
      mode: "simulator",
      execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
      from: { address: "addr1" },
      to: { address: "addr2" },
      amountSompi: "100",
      estimatedFeeSompi: "1",
      estimatedMass: "100",
      inputs: [],
      outputs: []
    };

    artifact.contentHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
    // IC-4′.5: planId is a derived label, recomputed by the verifier.
    artifact.planId = `plan-${artifact.contentHash.slice(0, 16)}`;
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));

    const result = await verifyArtifact(artifactPath);
    expect(result.ok).toBe(true);
    expect(result.actualHash).toBe(artifact.contentHash);

    fs.rmSync(tempDir, { recursive: true });
  });

  it("should fail verification if hash is manipulated", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    const artifactPath = path.join(tempDir, "test.json");

    const artifact: any = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.12.0-rc.23",
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: new Date().toISOString(),
      networkId: "simnet",
      mode: "simulator",
      execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
      planId: "test-plan",
      from: { address: "addr1" },
      to: { address: "addr2" },
      amountSompi: "100",
      estimatedFeeSompi: "1",
      estimatedMass: "100",
      inputs: [],
      outputs: [],
      contentHash: "fake-hash"
    };

    fs.writeFileSync(artifactPath, JSON.stringify(artifact));

    const result = await verifyArtifact(artifactPath);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Hash mismatch");

    fs.rmSync(tempDir, { recursive: true });
  });

  it("should migrate v1 to canonical correctly", () => {
    // Wave 1.3 re-base (D-Q1.f / IC-4′.2): a migration starts from a VERIFIED legacy
    // source. The former fixture declared no hashVersion and no contentHash (it could
    // not be verified, so it cannot be migrated). This is a legacy plan sealed under
    // hash version 1, with the fields the re-issued plan needs to be a valid plan.
    const v1: any = {
      schema: "hardkas.txPlan.v1",
      hashVersion: 1,
      networkId: "simnet",
      mode: "simulator",
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "10",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      planId: "p1",
      selectedUtxos: [{ outpoint: { transactionId: "t1", index: 0 }, amountSompi: "10" }],
      outputs: []
    };
    v1.contentHash = calculateContentHash(v1, 1);

    const canonical = migrateToCanonical(v1);
    expect(canonical.version).toBe(ARTIFACT_VERSION);
    expect(canonical.schema).toBe("hardkas.txPlan");
    expect(canonical.inputs).toBeDefined();
    expect(canonical.hardkasVersion).toBeDefined();
    expect(canonical.createdAt).toBeDefined();
    expect(canonical.contentHash).toBeDefined();
    // The re-issued plan is a version-5 artifact whose label derives from its identity.
    // `planId` was a derived label in version 1 as well (excluded from the hash), so
    // the legacy "p1" is neither re-issued nor a legacy claim: it is simply recomputed.
    expect(canonical.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(canonical.planId).toBe(`plan-${String(canonical.contentHash).slice(0, 16)}`);
    expect((canonical as any).legacyClaims?.fields?.planId).toBeUndefined();
  });
});
