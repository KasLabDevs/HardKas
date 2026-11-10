import { kaspaCovenantId } from "@hardkas/core";

/*
 * Port of rusty-kaspa v2.1.0 `crypto/txscript/src/covenants.rs` (`CovenantsContext::from_tx`, ACTIVE CONSENSUS), run by
 * the node as `check_covenant_info` in `tx_validation_in_utxo_context.rs` before the scripts.
 *
 * - An output whose authorizing input's UTXO already carries the same covenant id is a CONTINUATION: it is recorded in
 *   the authorizing input's context (`OpAuthOutputCount`/`OpAuthOutputIdx`) and in the covenant's shared context
 *   (`OpCovOutputCount`/`OpCovOutputIdx`).
 * - Any other bound output is a GENESIS, grouped by (authorizing input, covenant id); each group's id must equal
 *   `covenant_id(outpoint of the authorizing input, the group's outputs in index order)`
 *   (`consensus/core/src/hashing/covenant_id.rs`, here `kaspaCovenantId` of @hardkas/core), or the transaction fails with
 *   `WrongGenesisCovenantId`. Genesis outputs are validated but never enter the script-engine contexts.
 * - The shared context of a covenant id lists every input whose UTXO carries that id (`OpCovInputCount`/`OpCovInputIdx`).
 */

export const ZERO_HASH_HEX = "00".repeat(32);

export interface CovenantInputContext {
  /** Indices of the CONTINUATION outputs that declare this input as their authorizing input. */
  readonly authOutputs: number[];
}

export interface CovenantSharedContext {
  /** Indices of all inputs whose UTXO carries this covenant id. */
  readonly inputIndices: number[];
  /** Indices of all continuation outputs carrying this covenant id. */
  readonly outputIndices: number[];
}

export interface CovenantsContext {
  readonly inputCtxs: ReadonlyMap<number, CovenantInputContext>;
  /** Keyed by the lowercase hex covenant id. */
  readonly sharedCtxs: ReadonlyMap<string, CovenantSharedContext>;
}

export const EMPTY_COVENANTS_CONTEXT: CovenantsContext = { inputCtxs: new Map(), sharedCtxs: new Map() };

export type CovenantsErrorKind =
  | "WrongGenesisCovenantId"
  | "AuthInputOutOfBounds"
  | "InvalidCovInIndex"
  | "InvalidCovOutIndex"
  | "InvalidAuthCovOutIndex";

/** `kaspa_txscript_errors::CovenantsError`, with its upstream display string. */
export class CovenantsError extends Error {
  readonly code = "COVENANTS_ERROR";
  constructor(readonly kind: CovenantsErrorKind, readonly detail: string) {
    super(`covenants error: ${detail}`);
    this.name = "CovenantsError";
  }
}

/** What `from_tx` reads of a populated transaction. */
export interface CovenantTxView {
  readonly inputs: ReadonlyArray<{ readonly transactionId: string; readonly index: number }>;
  readonly outputs: ReadonlyArray<{
    readonly value: bigint;
    readonly scriptPublicKey: { readonly version: number; readonly script: string };
    readonly covenant?: { readonly authorizingInput: number; readonly covenantId: string } | undefined;
  }>;
  /** The covenant id carried by each input's UTXO (undefined when it carries none). */
  readonly inputCovenantIds: ReadonlyArray<string | undefined>;
}

/** CovenantsContext::from_tx. Throws CovenantsError exactly where the node does. */
export function buildCovenantsContext(tx: CovenantTxView): CovenantsContext {
  const inputCtxs = new Map<number, { authOutputs: number[] }>();
  const sharedCtxs = new Map<string, { inputIndices: number[]; outputIndices: number[] }>();
  const genesisGroups = new Map<string, { authInput: number; covenantId: string; outputs: number[] }>();

  tx.inputCovenantIds.forEach((id, i) => {
    if (id === undefined) return;
    const key = id.toLowerCase();
    let shared = sharedCtxs.get(key);
    if (!shared) {
      shared = { inputIndices: [], outputIndices: [] };
      sharedCtxs.set(key, shared);
    }
    shared.inputIndices.push(i);
  });

  tx.outputs.forEach((output, i) => {
    const binding = output.covenant;
    if (!binding) return;
    const auth = binding.authorizingInput;
    const covenantId = binding.covenantId.toLowerCase();
    if (!Number.isInteger(auth) || auth < 0 || auth >= tx.inputs.length) {
      throw new CovenantsError("AuthInputOutOfBounds", `output #${i} covenant authorizing input index ${auth} is out of bounds`);
    }
    const inputCovenantId = tx.inputCovenantIds[auth]?.toLowerCase();
    if (inputCovenantId !== undefined && inputCovenantId === covenantId) {
      let inputCtx = inputCtxs.get(auth);
      if (!inputCtx) {
        inputCtx = { authOutputs: [] };
        inputCtxs.set(auth, inputCtx);
      }
      inputCtx.authOutputs.push(i);
      // The shared context exists: the authorizing input's UTXO carries this id.
      sharedCtxs.get(covenantId)!.outputIndices.push(i);
    } else {
      const key = `${auth}:${covenantId}`;
      let group = genesisGroups.get(key);
      if (!group) {
        group = { authInput: auth, covenantId, outputs: [] };
        genesisGroups.set(key, group);
      }
      group.outputs.push(i);
    }
  });

  for (const group of genesisGroups.values()) {
    const input = tx.inputs[group.authInput]!;
    const expected = kaspaCovenantId(
      { transactionId: input.transactionId.toLowerCase(), index: input.index },
      group.outputs.map((i) => {
        const o = tx.outputs[i]!;
        return { index: i, value: o.value, scriptPublicKey: { version: o.scriptPublicKey.version, script: o.scriptPublicKey.script.toLowerCase() } };
      })
    );
    if (expected !== group.covenantId) {
      throw new CovenantsError(
        "WrongGenesisCovenantId",
        `input #${group.authInput} and outputs with covenant id ${group.covenantId} do not correspond to the expected genesis hashing`
      );
    }
  }

  return { inputCtxs, sharedCtxs };
}

/** CovenantsContext::num_auth_outputs: missing input contexts count as zero authorized outputs. */
export function numAuthOutputs(ctx: CovenantsContext, inputIndex: number): number {
  return ctx.inputCtxs.get(inputIndex)?.authOutputs.length ?? 0;
}

/** CovenantsContext::auth_output_index. */
export function authOutputIndex(ctx: CovenantsContext, inputIndex: number, k: number): number {
  const outs = ctx.inputCtxs.get(inputIndex)?.authOutputs ?? [];
  const idx = outs[k];
  if (idx === undefined) {
    throw new CovenantsError(
      "InvalidAuthCovOutIndex",
      `${k} is not a valid covenant output index for input ${inputIndex} with ${outs.length} authorized outputs`
    );
  }
  return idx;
}

export function numCovenantInputs(ctx: CovenantsContext, covenantId: string): number {
  return ctx.sharedCtxs.get(covenantId.toLowerCase())?.inputIndices.length ?? 0;
}

export function covenantInputIndex(ctx: CovenantsContext, covenantId: string, k: number): number {
  const idx = ctx.sharedCtxs.get(covenantId.toLowerCase())?.inputIndices[k];
  if (idx === undefined) throw new CovenantsError("InvalidCovInIndex", `covenant id ${covenantId} input ${k} is out of bounds`);
  return idx;
}

export function numCovenantOutputs(ctx: CovenantsContext, covenantId: string): number {
  return ctx.sharedCtxs.get(covenantId.toLowerCase())?.outputIndices.length ?? 0;
}

export function covenantOutputIndex(ctx: CovenantsContext, covenantId: string, k: number): number {
  const idx = ctx.sharedCtxs.get(covenantId.toLowerCase())?.outputIndices[k];
  if (idx === undefined) throw new CovenantsError("InvalidCovOutIndex", `covenant id ${covenantId} output ${k} is out of bounds`);
  return idx;
}
