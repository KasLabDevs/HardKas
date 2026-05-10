import { describe, it, expect } from "vitest";
import { computeQueryHash } from "../src/serialize.js";

describe("deterministic serialization", () => {
  it("should produce identical hashes for identical items", () => {
    const items1 = [{ a: 1, b: "hello" }, { c: 3 }];
    const items2 = [{ a: 1, b: "hello" }, { c: 3 }];

    expect(computeQueryHash(items1)).toBe(computeQueryHash(items2));
  });

  it("should produce identical hashes regardless of key order", () => {
    const items1 = [{ b: 2, a: 1 }];
    const items2 = [{ a: 1, b: 2 }];

    expect(computeQueryHash(items1)).toBe(computeQueryHash(items2));
  });

  it("should produce different hashes for different items", () => {
    const items1 = [{ a: 1 }];
    const items2 = [{ a: 2 }];

    expect(computeQueryHash(items1)).not.toBe(computeQueryHash(items2));
  });

  it("should handle empty arrays", () => {
    const hash = computeQueryHash([]);
    expect(hash).toHaveLength(64);
    expect(computeQueryHash([])).toBe(hash); // stable
  });

  it("should handle undefined values deterministically", () => {
    const items1 = [{ a: 1 }];
    const items2 = [{ a: 1, b: undefined }];

    expect(computeQueryHash(items1)).toBe(computeQueryHash(items2));
  });

  it("should produce a 64-char hex hash", () => {
    const hash = computeQueryHash([{ test: true }]);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
