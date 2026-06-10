import { describe, it, expect } from "vitest";
import {
  parseKasToSompi,
  formatSompiToKas,
  formatSignedSompiToKas,
  SOMPI_PER_KAS
} from "../src/money.js";

describe("Money Utilities", () => {
  describe("parseKasToSompi", () => {
    it("parses valid KAS decimal strings", () => {
      expect(parseKasToSompi("0")).toBe(0n);
      expect(parseKasToSompi("0.00000001")).toBe(1n);
      expect(parseKasToSompi("1")).toBe(100_000_000n);
      expect(parseKasToSompi("1.0")).toBe(100_000_000n);
      expect(parseKasToSompi("1.00000000")).toBe(100_000_000n);
      expect(parseKasToSompi("123.45678901")).toBe(12345678901n);
      expect(parseKasToSompi(" 1.25  ")).toBe(125_000_000n); // trims
      expect(parseKasToSompi("1.25 KAS")).toBe(125_000_000n); // strips suffix
    });

    it("accepts bigint and treats it as sompi", () => {
      expect(parseKasToSompi(0n)).toBe(0n);
      expect(parseKasToSompi(100_000_000n)).toBe(100_000_000n);
    });

    it("accepts safe integer numbers as sompi (compat debt)", () => {
      expect(parseKasToSompi(0)).toBe(0n);
      expect(parseKasToSompi(100_000_000)).toBe(100_000_000n);
      expect(parseKasToSompi(Number.MAX_SAFE_INTEGER)).toBe(
        BigInt(Number.MAX_SAFE_INTEGER)
      );
    });

    it("rejects unsafe numbers or floats", () => {
      expect(() => parseKasToSompi(1.25)).toThrow("KAS_AMOUNT_UNSAFE_NUMBER");
      expect(() => parseKasToSompi(NaN)).toThrow("KAS_AMOUNT_UNSAFE_NUMBER");
      expect(() => parseKasToSompi(Infinity)).toThrow("KAS_AMOUNT_UNSAFE_NUMBER");
      // Above MAX_SAFE_INTEGER
      expect(() => parseKasToSompi(9007199254740992)).toThrow("KAS_AMOUNT_UNSAFE_NUMBER");
    });

    it("rejects negative amounts", () => {
      expect(() => parseKasToSompi("-1")).toThrow("KAS_AMOUNT_NEGATIVE");
      expect(() => parseKasToSompi(-1)).toThrow("KAS_AMOUNT_NEGATIVE");
      expect(() => parseKasToSompi(-1n)).toThrow("KAS_AMOUNT_NEGATIVE");
    });

    it("rejects explicitly positive sign unless normalized", () => {
      expect(() => parseKasToSompi("+1")).toThrow("INVALID_KAS_AMOUNT");
    });

    it("rejects invalid characters", () => {
      expect(() => parseKasToSompi("")).toThrow("INVALID_KAS_AMOUNT");
      expect(() => parseKasToSompi(".")).toThrow("INVALID_KAS_AMOUNT");
      expect(() => parseKasToSompi("1.")).toThrow("INVALID_KAS_AMOUNT");
      expect(() => parseKasToSompi(".1")).toThrow("INVALID_KAS_AMOUNT");
      expect(() => parseKasToSompi("1,23")).toThrow("INVALID_KAS_AMOUNT");
      expect(() => parseKasToSompi("abc")).toThrow("INVALID_KAS_AMOUNT");
    });

    it("rejects scientific notation", () => {
      expect(() => parseKasToSompi("1e-8")).toThrow(
        "KAS_AMOUNT_SCIENTIFIC_NOTATION_UNSUPPORTED"
      );
      expect(() => parseKasToSompi("1E8")).toThrow(
        "KAS_AMOUNT_SCIENTIFIC_NOTATION_UNSUPPORTED"
      );
    });

    it("rejects too many decimals", () => {
      expect(() => parseKasToSompi("0.000000001")).toThrow(
        "KAS_AMOUNT_TOO_MANY_DECIMALS"
      );
      expect(() => parseKasToSompi("1.123456789")).toThrow(
        "KAS_AMOUNT_TOO_MANY_DECIMALS"
      );
    });
  });

  describe("formatSompiToKas", () => {
    it("formats sompi to KAS strings correctly", () => {
      expect(formatSompiToKas(0n)).toBe("0");
      expect(formatSompiToKas(1n)).toBe("0.00000001");
      expect(formatSompiToKas(100_000_000n)).toBe("1");
      expect(formatSompiToKas(125_000_000n)).toBe("1.25");
      expect(formatSompiToKas(12345678901n)).toBe("123.45678901");
    });

    it("accepts string representations of sompi", () => {
      expect(formatSompiToKas("125000000")).toBe("1.25");
    });

    it("rejects negative sompi", () => {
      expect(() => formatSompiToKas(-1n)).toThrow("SOMPI_AMOUNT_NEGATIVE");
    });

    it("rejects invalid sompi formats", () => {
      expect(() => formatSompiToKas("abc")).toThrow("INVALID_KAS_AMOUNT");
    });
  });

  describe("formatSignedSompiToKas", () => {
    it("formats positive sompi to KAS strings correctly", () => {
      expect(formatSignedSompiToKas(0n)).toBe("0");
      expect(formatSignedSompiToKas(1n)).toBe("0.00000001");
      expect(formatSignedSompiToKas(100_000_000n)).toBe("1");
    });

    it("formats negative sompi to KAS strings correctly", () => {
      expect(formatSignedSompiToKas(-1n)).toBe("-0.00000001");
      expect(formatSignedSompiToKas(-100000000n)).toBe("-1");
      expect(formatSignedSompiToKas("-125000000")).toBe("-1.25");
    });

    it("rejects invalid sompi formats", () => {
      expect(() => formatSignedSompiToKas("abc")).toThrow("INVALID_KAS_AMOUNT");
    });
  });
});
