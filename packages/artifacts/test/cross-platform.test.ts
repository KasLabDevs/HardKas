import { describe, it } from "node:test";
import assert from "node:assert";
import { canonicalStringify, CURRENT_HASH_VERSION } from "../src/canonical.js";

describe("Cross-Platform Canonicalization", () => {
  it("should normalize newlines in version 3", () => {
    const objWin = { text: "Line 1\r\nLine 2" };
    const objUnix = { text: "Line 1\nLine 2" };
    
    const strWin = canonicalStringify(objWin, 3);
    const strUnix = canonicalStringify(objUnix, 3);
    
    assert.strictEqual(strWin, strUnix);
    assert.strictEqual(strWin, '{"text":"Line 1\\nLine 2"}');
  });

  it("should normalize Unicode NFC in version 3", () => {
    // \u006e\u0303 (n + ~) vs \u00f1 (ñ)
    const obj1 = { name: "ma\u006e\u0303ana" };
    const obj2 = { name: "ma\u00f1ana" };
    
    const str1 = canonicalStringify(obj1, 3);
    const str2 = canonicalStringify(obj2, 3);
    
    assert.strictEqual(str1, str2);
  });

  it("should handle BigInt consistently in version 2+", () => {
    const obj = { val: 12345678901234567890n };
    const str = canonicalStringify(obj, 2);
    assert.strictEqual(str, '{"val":"n:12345678901234567890"}');
  });

  it("should sort keys deterministically", () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    
    assert.strictEqual(canonicalStringify(obj1), canonicalStringify(obj2));
    assert.strictEqual(canonicalStringify(obj1), '{"a":1,"b":2}');
  });

  it("should preserve versioning behavior", () => {
    const obj = { text: "a\r\nb" };
    // v2 does NOT normalize newlines
    assert.notStrictEqual(canonicalStringify(obj, 2), canonicalStringify(obj, 3));
    assert.strictEqual(canonicalStringify(obj, 2), '{"text":"a\\r\\nb"}');
  });
});
