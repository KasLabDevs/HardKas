import { describe, it, expect } from "vitest";
import { kaspaCovenantId } from "@hardkas/core";
import { buildCovenantsContext, CovenantsError, type CovenantTxView } from "../src/script/covenants.js";

/*
 * Port of the unit tests of rusty-kaspa v2.1.0 crypto/txscript/src/covenants.rs:277-451 (CovenantsContext::from_tx).
 * `create_genesis_tx` there: one input per entry of `inputCovenantIds` (outpoint (i, 0)), every output value 100 with the
 * default script public key, all outputs bound; genesis ids are computed with covenant_id(outpoint, group outputs).
 */

const idOf = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const txidOf = (i: number) => (i + 1).toString(16).padStart(64, "0");

interface OutputConfig {
  readonly authorizingInput: number;
  /** Outputs of the same group share a covenant id. */
  readonly group: number;
}

function createGenesisTx(inputGroups: Array<number | undefined>, outputs: OutputConfig[], computeCorrectIds: boolean): CovenantTxView {
  const inputs = inputGroups.map((_, i) => ({ transactionId: txidOf(i), index: 0 }));
  const outs = outputs.map((cfg) => ({
    value: 100n,
    scriptPublicKey: { version: 0, script: "" },
    covenant: { authorizingInput: cfg.authorizingInput, covenantId: idOf(cfg.group) }
  }));
  if (computeCorrectIds) {
    const groups = new Map<string, number[]>();
    outputs.forEach((cfg, i) => {
      if (inputGroups[cfg.authorizingInput] === cfg.group) return; // continuation keeps the input's id
      const key = `${cfg.authorizingInput}:${cfg.group}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    for (const [key, indices] of groups) {
      const auth = Number(key.split(":")[0]);
      const id = kaspaCovenantId(inputs[auth]!, indices.map((i) => ({ index: i, value: outs[i]!.value, scriptPublicKey: outs[i]!.scriptPublicKey })));
      for (const i of indices) outs[i] = { ...outs[i]!, covenant: { authorizingInput: auth, covenantId: id } };
    }
  }
  return { inputs, outputs: outs, inputCovenantIds: inputGroups.map((g) => (g === undefined ? undefined : idOf(g))) };
}

const asPlain = (ctx: ReturnType<typeof buildCovenantsContext>) => ({
  inputCtxs: Object.fromEntries([...ctx.inputCtxs].map(([k, v]) => [k, v.authOutputs])),
  sharedCtxs: Object.fromEntries([...ctx.sharedCtxs].map(([k, v]) => [k, { inputs: v.inputIndices, outputs: v.outputIndices }]))
});

describe("CovenantsContext::from_tx (covenants.rs unit tests)", () => {
  it("test_genesis_single_output: genesis outputs do not populate the contexts", () => {
    const ctx = buildCovenantsContext(createGenesisTx([undefined], [{ authorizingInput: 0, group: 1 }], true));
    expect(asPlain(ctx)).toEqual({ inputCtxs: {}, sharedCtxs: {} });
  });

  it("test_genesis_multiple_outputs", () => {
    const ctx = buildCovenantsContext(createGenesisTx([undefined], [{ authorizingInput: 0, group: 1 }, { authorizingInput: 0, group: 1 }], true));
    expect(asPlain(ctx)).toEqual({ inputCtxs: {}, sharedCtxs: {} });
  });

  it("test_genesis_invalid_covenant_id: WrongGenesisCovenantId(0, _)", () => {
    expect(() => buildCovenantsContext(createGenesisTx([undefined], [{ authorizingInput: 0, group: 1 }], false))).toThrowError(
      `covenants error: input #0 and outputs with covenant id ${idOf(1)} do not correspond to the expected genesis hashing`
    );
    try {
      buildCovenantsContext(createGenesisTx([undefined], [{ authorizingInput: 0, group: 1 }], false));
    } catch (e) {
      expect(e).toBeInstanceOf(CovenantsError);
      expect((e as CovenantsError).kind).toBe("WrongGenesisCovenantId");
    }
  });

  it("test_genesis_single_input_multiple_covenant_groups", () => {
    const ctx = buildCovenantsContext(
      createGenesisTx([undefined], [{ authorizingInput: 0, group: 1 }, { authorizingInput: 0, group: 2 }, { authorizingInput: 0, group: 1 }], true)
    );
    expect(asPlain(ctx)).toEqual({ inputCtxs: {}, sharedCtxs: {} });
  });

  it("test_genesis_multiple_inputs", () => {
    const ctx = buildCovenantsContext(createGenesisTx([undefined, undefined], [{ authorizingInput: 0, group: 1 }, { authorizingInput: 1, group: 2 }], true));
    expect(asPlain(ctx)).toEqual({ inputCtxs: {}, sharedCtxs: {} });
  });

  it("test_continuation_with_genesis: only the continuation enters the contexts", () => {
    const ctx = buildCovenantsContext(
      createGenesisTx(
        [42],
        [
          { authorizingInput: 0, group: 42 },
          { authorizingInput: 0, group: 100 },
          { authorizingInput: 0, group: 200 },
          { authorizingInput: 0, group: 100 }
        ],
        true
      )
    );
    expect(asPlain(ctx)).toEqual({ inputCtxs: { 0: [0] }, sharedCtxs: { [idOf(42)]: { inputs: [0], outputs: [0] } } });
  });

  it("test_authorizing_input_out_of_bounds: AuthInputOutOfBounds(0, 1)", () => {
    const view: CovenantTxView = {
      inputs: [{ transactionId: txidOf(0), index: 0 }],
      outputs: [{ value: 100n, scriptPublicKey: { version: 0, script: "" }, covenant: { authorizingInput: 1, covenantId: idOf(1) } }],
      inputCovenantIds: [undefined]
    };
    expect(() => buildCovenantsContext(view)).toThrowError("covenants error: output #0 covenant authorizing input index 1 is out of bounds");
  });

  it("test_no_covenant_outputs: inputs with an id still create the shared context", () => {
    const view: CovenantTxView = {
      inputs: [{ transactionId: txidOf(0), index: 0 }],
      outputs: [
        { value: 100n, scriptPublicKey: { version: 0, script: "" } },
        { value: 200n, scriptPublicKey: { version: 0, script: "" } }
      ],
      inputCovenantIds: [idOf(42)]
    };
    expect(asPlain(buildCovenantsContext(view))).toEqual({ inputCtxs: {}, sharedCtxs: { [idOf(42)]: { inputs: [0], outputs: [] } } });
  });
});
