import { describe, it, expect } from "vitest";
import { canonicalStringify, calculateContentHash } from "../src/canonical.js";

describe("PR 7: Cross-Platform Hash Determinism (v3)", () => {
  it("should normalize newlines (\r\n -> \n) in v3", () => {
    const objWin = { text: "line1\r\nline2" };
    const objUnix = { text: "line1\nline2" };
    
    const strWin = canonicalStringify(objWin, 3);
    const strUnix = canonicalStringify(objUnix, 3);
    
    expect(strWin).toBe(strUnix);
    expect(strWin).toContain("line1\\nline2");
  });

  it("should NOT normalize newlines in v2 (backward compatibility)", () => {
    const objWin = { text: "line1\r\nline2" };
    const objUnix = { text: "line1\nline2" };
    
    const strWin = canonicalStringify(objWin, 2);
    const strUnix = canonicalStringify(objUnix, 2);
    
    expect(strWin).not.toBe(strUnix);
  });

  it("should normalize UTF-8 NFC in v3", () => {
    // 'e' + combining acute accent (é) vs 'é' precomposed
    const s1 = "\u0065\u0301"; 
    const s2 = "\u00e9";
    
    expect(s1).not.toBe(s2); // Raw strings differ
    
    const h1 = calculateContentHash({ val: s1 }, 3);
    const h2 = calculateContentHash({ val: s2 }, 3);
    
    expect(h1).toBe(h2); // v3 hashes match
  });

  it("should produce different hashes for BigInt vs String (v2/v3 logic)", () => {
    const h1 = calculateContentHash({ val: 123n }, 3);
    const h2 = calculateContentHash({ val: "123" }, 3);
    expect(h1).not.toBe(h2);
  });
});
