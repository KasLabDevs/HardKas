/**
 * Transaction construction against the pinned kaspa-wasm 2.0.x SDK.
 *
 * `createTransaction(utxos, outputs, priorityFee)` in 2.0.x spends exactly the
 * given inputs into exactly the given outputs. Unlike 0.13.x it adds no change
 * output, and it does not check `priorityFee` against inputs minus outputs. So
 * change must be passed as an explicit output, and HardKAS checks conservation
 * itself: an unbalanced plan must never silently turn the difference into fee.
 */

export interface WasmUtxoEntrySource {
  readonly utxoEntry: { readonly amount: bigint };
}

export interface BalancedOutput {
  /** Value of the output, used for the conservation check. */
  readonly amountSompi: bigint;
  /** What is handed to the SDK: `{ address, amount }` or a `PaymentOutput`. */
  readonly output: unknown;
}

export function assertValueConservation(input: {
  readonly inputAmounts: readonly bigint[];
  readonly outputAmounts: readonly bigint[];
  readonly feeSompi: bigint;
}): void {
  const inputs = input.inputAmounts.reduce((a, b) => a + b, 0n);
  const outputs = input.outputAmounts.reduce((a, b) => a + b, 0n);
  if (input.feeSompi < 0n || inputs - outputs !== input.feeSompi) {
    const err = new Error(
      `TX_VALUE_NOT_CONSERVED: inputs ${inputs} - outputs ${outputs} = ${inputs - outputs} sompi, ` +
        `but the plan's fee is ${input.feeSompi}. Refusing to build a transaction whose difference would be paid as fee.`
    );
    (err as any).code = "TX_VALUE_NOT_CONSERVED";
    throw err;
  }
}

/** Builds an unsigned transaction whose outputs (change included) and fee balance the inputs exactly. */
export function createBalancedTransaction(
  sdk: any,
  input: {
    readonly utxos: readonly WasmUtxoEntrySource[];
    readonly outputs: readonly BalancedOutput[];
    readonly feeSompi: bigint;
  }
): any {
  assertValueConservation({
    inputAmounts: input.utxos.map((u) => u.utxoEntry.amount),
    outputAmounts: input.outputs.map((o) => o.amountSompi),
    feeSompi: input.feeSompi
  });
  return sdk.createTransaction(
    [...input.utxos],
    input.outputs.map((o) => o.output),
    input.feeSompi
  );
}

export interface WasmUtxoInput {
  readonly address?: string | undefined;
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly utxoEntry: {
    readonly amount: bigint;
    /** A WASM ScriptPublicKey (see toWasmScriptPublicKey). */
    readonly scriptPublicKey: unknown;
    readonly blockDaaScore: bigint;
    readonly isCoinbase: boolean;
  };
}

export interface ScriptOutput {
  readonly value: bigint;
  /** A WASM ScriptPublicKey: outputs that pay a script rather than an address. */
  readonly scriptPublicKey: unknown;
}

/**
 * Builds an unsigned version-0 transaction whose outputs are arbitrary scripts
 * (P2SH/covenant locks), balanced exactly against its inputs.
 *
 * Every output is fixed at construction: in 2.x `tx.outputs` returns a copy, so
 * pushing to it afterwards silently drops the output. Each input carries its
 * UTXO entry, which signTransaction() needs.
 */
export function createScriptTransaction(
  sdk: any,
  input: {
    readonly utxos: readonly WasmUtxoInput[];
    readonly outputs: readonly ScriptOutput[];
    readonly feeSompi: bigint;
  }
): any {
  assertValueConservation({
    inputAmounts: input.utxos.map((u) => u.utxoEntry.amount),
    outputAmounts: input.outputs.map((o) => o.value),
    feeSompi: input.feeSompi
  });
  return new sdk.Transaction({
    version: 0,
    inputs: input.utxos.map((u) => ({
      previousOutpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 1,
      utxo: {
        address: u.address,
        outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
        amount: u.utxoEntry.amount,
        scriptPublicKey: u.utxoEntry.scriptPublicKey,
        blockDaaScore: u.utxoEntry.blockDaaScore,
        isCoinbase: u.utxoEntry.isCoinbase
      }
    })),
    outputs: [...input.outputs],
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
}

/**
 * A plan's scriptPublicKey as a WASM ScriptPublicKey with an explicit version
 * (ADJ-002 transport rule): `{ version, scriptPublicKey | script }` is used as
 * is; a 72-hex string starting with `0000` is version 0 + a 34-byte script;
 * any other string is a bare version-0 script. Handing the SDK a bare hex
 * string would make it read the first two bytes as the version.
 */
export function toWasmScriptPublicKey(sdk: any, spk: unknown): any {
  if (spk && typeof spk === "object") {
    const o = spk as { version?: number | string; scriptPublicKey?: string; script?: string };
    return new sdk.ScriptPublicKey(Number(o.version ?? 0), String(o.scriptPublicKey || o.script || ""));
  }
  const hex = String(spk ?? "");
  if (/^[0-9a-fA-F]{72}$/.test(hex) && hex.startsWith("0000")) {
    return new sdk.ScriptPublicKey(0, hex.slice(4));
  }
  return new sdk.ScriptPublicKey(0, hex);
}

/**
 * Plan outputs plus the plan's change, in order, as `{ address, amount }`.
 * Change is part of the transaction in 2.0.x; nothing adds it later.
 */
export function planOutputsWithChange(plan: {
  readonly outputs: readonly { readonly address?: string; readonly amountSompi: string | bigint }[];
  readonly change?: { readonly address: string; readonly amountSompi: string | bigint } | null | undefined;
}): BalancedOutput[] {
  const all = [...plan.outputs];
  if (plan.change && BigInt(plan.change.amountSompi) > 0n) all.push(plan.change);
  return all.map((o) => {
    if (!o.address) throw new Error("Output is missing address.");
    const amount = BigInt(o.amountSompi);
    return { amountSompi: amount, output: { address: o.address, amount } };
  });
}
