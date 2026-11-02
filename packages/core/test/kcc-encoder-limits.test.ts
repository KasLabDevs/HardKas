import { describe, it, expect } from "vitest";
import { kcc1DecodeState, kcc1EncodeState, kcc20EncodeState, kcc20State } from "../src/index.js";

// -----------------------------------------------------------------------------
// I-05 · encoder limits the first independent review found: a state layout that names a field twice used to encode and
// then never decode; kcc20EncodeState used to accept a negative amount, which no KCC-20 state may hold (§1). Both are
// refused where they enter. Canonical level.
// -----------------------------------------------------------------------------

const Z = "00".repeat(32);

describe("I-05 · KCC encoder limits", () => {
  it("a state layout that declares a field twice is refused by EncodeState and by DecodeState (KCC1_TYPE_INVALID)", () => {
    const fields = [
      { name: "a", type: "int" },
      { name: "a", type: "int" }
    ] as any;
    expect(() => kcc1EncodeState(fields, { a: 1n })).toThrow(/^KCC1_TYPE_INVALID: .*'a' twice/);
    expect(() => kcc1DecodeState("080100000000000000", fields)).toThrow(/^KCC1_TYPE_INVALID: .*'a' twice/);
  });

  it("kcc20EncodeState refuses a negative amount (KCC20_STATE_INVALID); zero and int64 max encode to 112 bytes", () => {
    const st = (amount: bigint) => kcc20State({ amount, owner: Z, ownerScheme: 0, borrowScheme: 0, borrowGuard: Z, extensionCommitment: Z });
    expect(() => kcc20EncodeState(st(-1n))).toThrow(/^KCC20_STATE_INVALID: .*negative/);
    expect(kcc20EncodeState(st(0n)).length).toBe(112);
    expect(kcc20EncodeState(st((1n << 63n) - 1n)).length).toBe(112);
  });
});
