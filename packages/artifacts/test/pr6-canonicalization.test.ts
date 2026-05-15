import { describe, it, expect } from "vitest";
import { canonicalStringify, calculateContentHash } from "../src/canonical.js";

describe("PR 6: Artifact Hardening", () => {
  describe("BigInt/String Canonicalization", () => {
    it("should distinguish BigInt(123) and String('123') in v2", () => {
      const b = 123n;
      const s = "123";
      
      const bStr = canonicalStringify({ val: b }, 2);
      const sStr = canonicalStringify({ val: s }, 2);
      
      expect(bStr).not.toBe(sStr);
      expect(bStr).toContain('"val":"n:123"');
      expect(sStr).toContain('"val":"123"');
    });

    it("should remain backward compatible with v1 if requested", () => {
      const b = 123n;
      const s = "123";
      
      const bStr = canonicalStringify({ val: b }, 1);
      const sStr = canonicalStringify({ val: s }, 1);
      
      expect(bStr).toBe(sStr);
    });

    it("should produce different hashes for BigInt vs String in v2", () => {
      const bHash = calculateContentHash({ val: 123n }, 2);
      const sHash = calculateContentHash({ val: "123" }, 2);
      
      expect(bHash).not.toBe(sHash);
    });
  });
});
