import { describe, it, expect } from "vitest";
import { silToV1Arg } from "../src/v1-contract-facts.js";

// ISSUE-ONCHAIN-JSON-PRECISION-1 · an int handed to the v1 engine as a JS number past 2^53 is already rounded: silToV1Arg
// refuses it (V1_PLAN_INVALID) instead of writing the rounded digits into the plan. A bigint, or a safe number, is exact.
describe("ISSUE-ONCHAIN-JSON-PRECISION-1 · silToV1Arg never writes a rounded int", () => {
  it("a bigint or a safe number is written as its exact digits; an unsafe number is refused, nested too", () => {
    expect(silToV1Arg({ kind: "int", value: 9007199254740993n })).toEqual({ kind: "int", value: "9007199254740993" });
    expect(silToV1Arg({ kind: "int", value: 42 })).toEqual({ kind: "int", value: "42" });
    expect(() => silToV1Arg({ kind: "int", value: 2 ** 53 + 2 })).toThrow(/V1_PLAN_INVALID|not an exact integer/);
    expect(() => silToV1Arg({ kind: "array", value: [{ kind: "int", value: 1.5 }] })).toThrow(/not an exact integer/);
  });
});
