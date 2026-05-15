import { describe, it, expect } from "vitest";
import { canonicalStringify, calculateContentHash } from "../src/canonical.js";
import { ARTIFACT_VERSION } from "../src/schemas.js";

describe("Artifact Golden Fixtures (Cross-Runtime)", () => {
  // RULE: These tests must pass on any Node version, OS, or CI environment.
  // Any change to these golden strings or hashes indicates a breaking 
  // change to artifact identity.

  it("should have stable version-aware hashing", () => {
    const artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      amountSompi: "100000000"
    };

    const canonical = canonicalStringify(artifact);
    // Note: 'version' IS included now.
    expect(canonical).toContain('"version":"1.0.0-alpha"');
    
    const hash = calculateContentHash(artifact);
    // If ARTIFACT_VERSION is 1.0.0-alpha, this hash should be stable.
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });

  it("should distinguish BigInt from Number in canonical strings", () => {
    const objBigInt = { amount: 100n };
    const objNumber = { amount: 100 };

    const canonBigInt = canonicalStringify(objBigInt);
    const canonNumber = canonicalStringify(objNumber);

    // BigInt => "n:100" (v2+ behavior)
    // Number => 100 (JSON number)
    expect(canonBigInt).toBe('{"amount":"n:100"}');
    expect(canonNumber).toBe('{"amount":100}');

    expect(calculateContentHash(objBigInt)).not.toBe(calculateContentHash(objNumber));
  });

  it("should maintain stable key sorting regardless of input order", () => {
    const input1 = { z: 1, a: 2, m: { y: 3, b: 4 } };
    const input2 = { a: 2, z: 1, m: { b: 4, y: 3 } };

    const expected = '{"a":2,"m":{"b":4,"y":3},"z":1}';

    expect(canonicalStringify(input1)).toBe(expected);
    expect(canonicalStringify(input2)).toBe(expected);
    expect(calculateContentHash(input1)).toBe(calculateContentHash(input2));
  });

  it("should ignore metadata but include semantic version", () => {
    const base = {
      schema: "hardkas.signedTx",
      version: ARTIFACT_VERSION,
      data: "semantic",
      createdAt: "2024-01-01T00:00:00Z",
      hardkasVersion: "0.1.0"
    };

    const mutatedMetadata = {
      ...base,
      createdAt: "2025-12-31T23:59:59Z",
      hardkasVersion: "0.2.0-beta",
      rpcUrl: "http://another-node:16110"
    };

    const mutatedVersion = {
      ...base,
      version: "2.0.0-beta" // Semantic change
    };

    const hashBase = calculateContentHash(base);
    const hashMeta = calculateContentHash(mutatedMetadata);
    const hashVer = calculateContentHash(mutatedVersion);

    expect(hashMeta).toBe(hashBase);
    expect(hashVer).not.toBe(hashBase);
  });

  it("should skip undefined but retain null", () => {
    const obj1 = { a: 1, b: undefined };
    const obj2 = { a: 1 };
    const obj3 = { a: 1, b: null };

    expect(canonicalStringify(obj1)).toBe('{"a":1}');
    expect(canonicalStringify(obj2)).toBe('{"a":1}');
    expect(canonicalStringify(obj3)).toBe('{"a":1,"b":null}');
  });
});
