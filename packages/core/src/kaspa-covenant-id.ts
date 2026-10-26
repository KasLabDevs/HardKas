import { KaspaHasher } from "./kaspa-sighash.js";

/*
 * The covenant id of a genesis (rusty-kaspa v2.1.0 consensus/core/src/hashing/covenant_id.rs), ported to verify the anchor
 * of a covenant's lineage without the node: blake2b-256 keyed "CovenantID" over the authorizing input's outpoint and the
 * outputs it authorizes (each one's index, value and script public key — not its binding, which would refer to itself).
 * It is what populate_genesis_covenants binds and what consensus checks a genesis binding against. Checked against a
 * genesis the node accepted (the Silver corpus) and against kaspa-wasm's populateGenesisCovenants
 * (core/test/kaspa-covenant-id.test.ts).
 */

export interface KaspaCovenantIdOutput {
  /** The output's index in its transaction. */
  readonly index: number;
  readonly value: bigint;
  readonly scriptPublicKey: { readonly version: number; /** hex */ readonly script: string };
}

function hex(s: string, what: string): Uint8Array {
  if (typeof s !== "string" || !/^(?:[0-9a-f]{2})*$/i.test(s)) {
    const err = new Error(`KASPA_COVENANT_ID_INPUT_INVALID: ${what} is not hex`);
    (err as any).code = "KASPA_COVENANT_ID_INPUT_INVALID";
    throw err;
  }
  return Uint8Array.from(Buffer.from(s, "hex"));
}

/** covenant_id(outpoint, auth_outputs): the 32-byte covenant id (hex) a genesis gives the outputs it authorizes. */
export function kaspaCovenantId(outpoint: { readonly transactionId: string; readonly index: number }, outputs: readonly KaspaCovenantIdOutput[]): string {
  const h = new KaspaHasher("CovenantID").bytes(hex(outpoint.transactionId, "the outpoint's transaction id")).u32(outpoint.index).u64(BigInt(outputs.length));
  for (const o of outputs) h.u32(o.index).u64(o.value).u16(o.scriptPublicKey.version).varBytes(hex(o.scriptPublicKey.script, `output ${o.index}'s script`));
  return Buffer.from(h.digest()).toString("hex");
}
