import { describe, it, expect } from "vitest";
import { parseFundAmount } from "../src/runners/accounts-fund-runner.js";

// `simulator fund --amount` (and the deprecated `accounts fund`) used
// BigInt(parseFloat(amount) * 1e8): 1.1 threw a RangeError and 0 silently
// funded the 1000 KAS default.
describe("fund --amount parsing", () => {
  it("accepts decimal KAS amounts that are not exact binary floats", () => {
    expect(parseFundAmount("1.1")).toBe(110_000_000n);
    expect(parseFundAmount("2.675")).toBe(267_500_000n);
    expect(parseFundAmount("1000")).toBe(100_000_000_000n);
    expect(parseFundAmount("0.00000001")).toBe(1n);
  });

  it("refuses zero instead of funding the default", () => {
    expect(() => parseFundAmount("0")).toThrow(/greater than 0/);
  });

  it("refuses malformed amounts", () => {
    expect(() => parseFundAmount("1e3")).toThrow(/SCIENTIFIC/);
    expect(() => parseFundAmount("-5")).toThrow(/NEGATIVE/);
    expect(() => parseFundAmount("1.123456789")).toThrow(/TOO_MANY_DECIMALS/);
  });
});
