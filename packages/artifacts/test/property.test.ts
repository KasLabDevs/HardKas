import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { canonicalStringify, calculateContentHash } from "../src/canonical.js";

describe("Artifact Property Tests (fast-check)", () => {
  it("should be deterministic: same object always produces same canonical string", () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const str1 = canonicalStringify(str);
        const str2 = canonicalStringify(str);
        expect(str1).toBe(str2);
      })
    );
  });

  it("should be order-independent: key order in source doesn't affect output", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter((k) => k !== "__proto__"),
          fc.anything()
        ),
        (dict) => {
          const keys = Object.keys(dict);
          if (keys.length < 2) return;

          // Create a copy with reversed keys
          const reversedDict: any = {};
          for (const key of [...keys].reverse()) {
            reversedDict[key] = dict[key];
          }

          expect(canonicalStringify(dict)).toBe(canonicalStringify(reversedDict));
        }
      )
    );
  });

  it("should preserve null and exclude undefined (semantics check)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (dict) => {
        const withNull = { ...dict, a: null };
        const withUndefined = { ...dict, b: undefined };

        const strNull = canonicalStringify(withNull);
        const strUndef = canonicalStringify(withUndefined);

        expect(strNull).toContain('"a":null');
        expect(strUndef).not.toContain('"b":undefined');
      })
    );
  });

  it("should handle nested objects canonically", () => {
    fc.assert(
      fc.property(
        fc.record({
          a: fc.dictionary(fc.string(), fc.anything()),
          b: fc.dictionary(fc.string(), fc.anything())
        }),
        (record) => {
          const str1 = canonicalStringify(record);
          const str2 = canonicalStringify({ b: record.b, a: record.a });
          expect(str1).toBe(str2);
        }
      )
    );
  });

  it("should detect any semantic field change in hash", () => {
    // We only test a subset of fields that are considered semantic
    fc.assert(
      fc.property(
        fc.record({
          schema: fc.string(),
          version: fc.string(),
          networkId: fc.string(),
          amountSompi: fc.string()
        }),
        (base) => {
          const hash1 = calculateContentHash(base);

          // Mutate one field
          const mutated = { ...base, amountSompi: base.amountSompi + "1" };
          const hash2 = calculateContentHash(mutated);

          expect(hash1).not.toBe(hash2);
        }
      )
    );
  });

  it("should exclude only the top-level self reference (contentHash) and authenticate artifactId", () => {
    // Wave 1.1 · IC-1′.1a: `contentHash` is excluded by exact path. A top-level
    // `artifactId` is no exclusion in hashVersion 5 (IC-7.3 forbids it outright from
    // Wave 1.3), so adding one must change the hash instead of being ignored.
    fc.assert(
      fc.property(
        fc.record({
          schema: fc.string(),
          version: fc.string(),
          networkId: fc.string()
        }),
        (base) => {
          const hash1 = calculateContentHash(base);

          const withSelfReference = { ...base, contentHash: "something-else" };
          expect(calculateContentHash(withSelfReference)).toBe(hash1);

          const withIdentityCopy = { ...base, artifactId: "another-id" };
          expect(calculateContentHash(withIdentityCopy)).not.toBe(hash1);
        }
      )
    );
  });

  it("should handle BigInt serialization stably", () => {
    fc.assert(
      fc.property(fc.bigInt(), (val) => {
        const obj = { val };
        const str = canonicalStringify(obj);
        // Current implementation likely stringifies bigints
        expect(typeof str).toBe("string");
        expect(str).toContain(val.toString());
      })
    );
  });
});
