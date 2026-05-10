import { describe, it, expect } from "vitest";
import { maskSecrets } from "../src/security.js";

describe("Security Redaction", () => {
  it("should redact 64-character hex strings (private keys)", () => {
    const pk = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const msg = `Your key is ${pk}`;
    const redacted = maskSecrets(msg);
    
    expect(redacted).not.toContain(pk);
    expect(redacted).toContain("123456...cdef [REDACTED]");
  });

  it("should redact mnemonics (BIP39 approximation)", () => {
    const mnemonic = "word word word word word word word word word word word word";
    const msg = `Mnemonic: ${mnemonic}`;
    const redacted = maskSecrets(msg);
    
    expect(redacted).toContain("[MNEMONIC REDACTED]");
  });

  it("should redact sensitive fields in objects recursively", () => {
    const obj = {
      user: "alice",
      details: {
        password: "secretpassword123",
        nested: {
          secretKey: "999888777666555444333222111000aa999888777666555444333222111000aa"
        }
      }
    };

    const redacted = maskSecrets(obj);
    
    expect(redacted.details.password).toBe("[REDACTED]");
    expect(redacted.details.nested.secretKey).toBe("[REDACTED]");
    expect(redacted.user).toBe("alice");
  });
});
