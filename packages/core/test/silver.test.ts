import { describe, test, expect } from "vitest";
import {
  createKaspaP2shBlake2bLock,
  createPushOnlySignatureScript
} from "../src/silver.js";

describe("SilverScript Core Utilities", () => {
  describe("createKaspaP2shBlake2bLock", () => {
    test("calculates correct Kaspa P2SH lock for OP_TRUE (51)", () => {
      const lock = createKaspaP2shBlake2bLock("51");
      
      expect(lock.scriptPublicKeyVersion).toBe(0);
      expect(lock.redeemScriptHex).toBe("51");
      
      // The blake2b hash of bytes [0x51]
      expect(lock.redeemScriptHash).toBe("ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d");
      
      // Expected locking script shape: aa20 + <hash> + 87
      expect(lock.lockingScriptHex).toBe("aa20ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d87");
    });

    test("calculates correct Kaspa P2SH lock for OP_TRUE OP_VERIFY OP_TRUE (516951)", () => {
      const lock = createKaspaP2shBlake2bLock("516951");
      expect(lock.redeemScriptHex).toBe("516951");
      // The blake2b hash of bytes [0x51, 0x69, 0x51]
      expect(lock.redeemScriptHash).toBe("0f091053318d6c1772a5dd4a0a7cce6f9ef98a32166c7906f207bf83dd4afd30");
      expect(lock.lockingScriptHex).toBe("aa200f091053318d6c1772a5dd4a0a7cce6f9ef98a32166c7906f207bf83dd4afd3087");
    });
  });

  describe("createPushOnlySignatureScript", () => {
    test("pushes 1 byte redeem script with no args", () => {
      // [] + 51 => 0151
      const script = createPushOnlySignatureScript([], "51");
      expect(script).toBe("0151");
    });

    test("pushes 3 byte redeem script with no args", () => {
      // [] + 516951 => 03516951
      const script = createPushOnlySignatureScript([], "516951");
      expect(script).toBe("03516951");
    });

    test("pushes 1 byte arg followed by 3 byte redeem script", () => {
      // [arg aa] + 516951 => 01aa03516951
      const script = createPushOnlySignatureScript(["aa"], "516951");
      expect(script).toBe("01aa03516951");
    });

    test("differentiates data bytes from executed opcodes (arg 51)", () => {
      // [arg 51] + 516951 => 015103516951
      // Here 51 is data (OP_TRUE as data, pushed), so it must be prefixed with 01.
      const script = createPushOnlySignatureScript(["51"], "516951");
      expect(script).toBe("015103516951");
    });

    test("pushes multiple args correctly", () => {
      const script = createPushOnlySignatureScript(["aa", "bbcc"], "516951");
      expect(script).toBe("01aa02bbcc03516951");
    });

    test("rejects malformed pushdata in args", () => {
      expect(() => {
        createPushOnlySignatureScript(["a"], "516951");
      }).toThrowError(/Argument must be valid hex/);
      
      expect(() => {
        createPushOnlySignatureScript(["zx"], "516951");
      }).toThrowError(/Argument must be valid hex/);
    });

    test("rejects empty redeem script", () => {
      expect(() => {
        createPushOnlySignatureScript([], "");
      }).toThrowError(/Redeem script cannot be empty/);
    });

    test("rejects malformed redeem script", () => {
      expect(() => {
        createPushOnlySignatureScript([], "5");
      }).toThrowError(/Redeem script must be valid hex/);
      
      expect(() => {
        createPushOnlySignatureScript([], "5z");
      }).toThrowError(/Redeem script must be valid hex/);
    });
  });
});
