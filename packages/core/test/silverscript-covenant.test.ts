import { describe, it, expect } from "vitest";
import {
  compileSilverSuccessor,
  getSilContract,
  isSingletonAuthTransition,
  parseSilverSourceAst,
  silverCovenantDeclarations,
  type SilArtifactValue
} from "../src/index.js";

const COUNTER = `pragma silverscript ^0.1.0;

contract Counter(int init_value) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta) : (State) {
        require(delta > 0);
        return(State { value: prev_state.value + delta });
    }
}
`;

const DERIVED = `pragma silverscript ^0.1.0;

contract Derived(int init_value) {
    int value = init_value * 2;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta) : (State) {
        return(State { value: prev_state.value + delta });
    }
}
`;

const int = (v: bigint): SilArtifactValue => ({ kind: "int", value: v });
const stateBytes = (a: any) => {
  const c = getSilContract(a).contract.compiled;
  return Buffer.from(c.bytecode).subarray(c.state_span.offset, c.state_span.offset + c.state_span.len).toString("hex");
};

describe("compileSilverSuccessor", () => {
  it("recompiles the same template with only the state changed", async () => {
    const r = await compileSilverSuccessor({
      source: COUNTER,
      constructorArgs: [int(7n)],
      stateToConstructorArg: { value: 0 },
      nextState: { value: int(12n) }
    });
    expect(r.successorConstructorArgs).toEqual([int(12n)]);
    expect(stateBytes(r.current.artifact)).toBe("080700000000000000");
    expect(stateBytes(r.successor.artifact)).toBe("080c00000000000000");
    expect(r.stateSpan).toEqual({ offset: 1, currentLen: 9, successorLen: 9 });
    expect(r.current.provenance.contracts[0]!.templateHash).toBe(r.successor.provenance.contracts[0]!.templateHash);
    expect(r.declarations).toEqual([{ policy: "bump", form: "covenant", binding: "auth", from: 1, to: 1, mode: "transition" }]);
    expect(r.declarations.every(isSingletonAuthTransition)).toBe(true);
  });

  it("is NOT_IMPLEMENTED when a State field is derived rather than a constructor parameter", async () => {
    await expect(
      compileSilverSuccessor({ source: DERIVED, constructorArgs: [int(7n)], stateToConstructorArg: { value: 0 }, nextState: { value: int(12n) } })
    ).rejects.toMatchObject({ code: "SILVER_SUCCESSOR_NOT_IMPLEMENTED" });
  });

  it("refuses an incomplete or inconsistent mapping", async () => {
    const base = { source: COUNTER, constructorArgs: [int(7n)], nextState: { value: int(12n) } };
    await expect(compileSilverSuccessor({ ...base, stateToConstructorArg: {} })).rejects.toMatchObject({ code: "SILVER_SUCCESSOR_NOT_IMPLEMENTED" });
    await expect(compileSilverSuccessor({ ...base, stateToConstructorArg: { value: 0, other: 0 } })).rejects.toMatchObject({ code: "SILVER_SUCCESSOR_NOT_IMPLEMENTED" });
    await expect(compileSilverSuccessor({ ...base, stateToConstructorArg: { value: 3 } })).rejects.toMatchObject({ code: "SILVER_SUCCESSOR_NOT_IMPLEMENTED" });
    await expect(compileSilverSuccessor({ ...base, stateToConstructorArg: { value: 0 }, nextState: {} })).rejects.toMatchObject({ code: "SILVER_SUCCESSOR_STATE_INVALID" });
  });

  it("refuses a successor whose state bytes do not change", async () => {
    await expect(
      compileSilverSuccessor({ source: COUNTER, constructorArgs: [int(7n)], stateToConstructorArg: { value: 0 }, nextState: { value: int(7n) } })
    ).rejects.toMatchObject({ code: "SILVER_SUCCESSOR_STATE_UNCHANGED" });
  });
});

describe("silverCovenantDeclarations", () => {
  it("reads the declaration shape from the official AST, spec defaults included", async () => {
    const src = `pragma silverscript ^0.1.0;
contract C(int init_amount) {
    int amount = init_amount;
    #[covenant.singleton(mode = transition)]
    function step(State prev_state, int delta) : (State) {
        return(State { amount: prev_state.amount + delta });
    }
}
`;
    const decl = silverCovenantDeclarations(await parseSilverSourceAst(src));
    expect(decl).toEqual([{ policy: "step", form: "covenant.singleton", binding: "auth", from: 1, to: 1, mode: "transition" }]);
  });
});
