import {
  V1_MASS_PARAMS,
  measureV1Mass,
  v1EstimatedSerializedSize,
  v1FeeMass,
  v1NonContextualMasses,
  v1StorageMass,
  type V1MassTxShape,
  type V1StorageCell
} from "@hardkas/tx-builder";
import { splitScriptPublicKey } from "./crypto/tx-hashing.js";
import type { KaspaRpcTransaction, SimulatorUtxo } from "./types.js";

/*
 * Transaction mass, from one authority (SIM-08): @hardkas/tx-builder's node-rule mass (v1-mass.ts, term by term from
 * rusty-kaspa 2.1.0 consensus/core/src/mass/mod.rs and mining/src/mempool/check_transaction_standard.rs). The simulator
 * used to keep a fourth implementation of its own that ignored the v1 bytes, compute budgets, the covenant plurality and
 * the normalization of the transient mass, and charged the relay fee on the storage mass. Nothing here is a new formula.
 */

export const MASS_PER_TX_BYTE = V1_MASS_PARAMS.massPerTxByte;
export const MASS_PER_SCRIPT_PUB_KEY_BYTE = V1_MASS_PARAMS.massPerScriptPubKeyByte;
export const MASS_PER_SIG_OP = V1_MASS_PARAMS.gramsPerSigOpCountUnit;
export const TRANSIENT_BYTE_TO_MASS_FACTOR = V1_MASS_PARAMS.transientByteToMassFactor;
export const STORAGE_MASS_PARAMETER = V1_MASS_PARAMS.storageMassParameter;
/** Block mass limits of the compute and storage masses (params.rs); the transient limit is 1 000 000. */
export const MAXIMUM_BLOCK_MASS = V1_MASS_PARAMS.blockLimits.compute;
/**
 * kaspa-wasm's `maximumStandardTransactionMass()`. Kept as a constant for callers; rusty-kaspad 2.1.0's mempool bounds
 * each mass by its block limit instead (see measureTransactionMass), so the simulator does not refuse on it.
 */
export const MAXIMUM_STANDARD_TRANSACTION_MASS = 100_000n;
/** mining/src/mempool/config.rs: 100 000 sompi per kg = 100 sompi per gram. */
export const DEFAULT_MINIMUM_RELAY_FEERATE = V1_MASS_PARAMS.minimumRelayTransactionFee / 1000n;

export interface TransactionMass {
  readonly computeMass: bigint;
  readonly transientMass: bigint;
  readonly storageMass: bigint;
  /** max(compute, transient, storage) */
  readonly mass: bigint;
}

export interface MeasuredTransactionMass extends TransactionMass {
  /** max(compute, normalized transient): what the relay fee is charged on. */
  readonly feeMass: bigint;
  /** max(compute, normalized transient, storage): what the node prioritizes the transaction by. */
  readonly priorityMass: bigint;
  readonly withinBlockLimits: boolean;
}

const scriptBytes = (spkHex: string): number => {
  const clean = String(spkHex ?? "").replace(/^0x/, "");
  return clean.length / 2;
};

/** The mass shape of a transaction as the simulator holds it. A v1 input without a compute budget commits 0. */
export function massShapeOf(tx: KaspaRpcTransaction): V1MassTxShape {
  const version = Number(tx.version ?? 0);
  return {
    version,
    inputs: tx.inputs.map((i: any) => ({
      signatureScriptBytes: scriptBytes(i.signatureScript ?? ""),
      ...(version >= 1 ? { computeBudget: Number(i.computeBudget ?? 0) } : { sigOpCount: Number(i.sigOpCount ?? 0) })
    })),
    outputs: tx.outputs.map((o) => ({
      scriptBytes: scriptBytes(splitScriptPublicKey(o.scriptPublicKey).script),
      covenant: o.covenant !== undefined && o.covenant !== null
    })),
    payloadBytes: scriptBytes(tx.payload ?? "")
  };
}

/** KIP-9 storage cells of a transaction: the UTXOs it spends and the ones it creates (plurality includes covenant ids). */
export function storageCellsOf(tx: KaspaRpcTransaction, spent: readonly SimulatorUtxo[]): { inputs: V1StorageCell[]; outputs: V1StorageCell[] } {
  return {
    inputs: spent.map((u) => ({
      amountSompi: BigInt(u.amountSompi),
      scriptBytes: scriptBytes(u.scriptPublicKey.replace(/^0000(?=20|21|aa)/i, "")),
      covenantId: u.covenantId !== undefined || u.covenant !== undefined
    })),
    outputs: tx.outputs.map((o) => ({
      amountSompi: BigInt(o.amount),
      scriptBytes: scriptBytes(splitScriptPublicKey(o.scriptPublicKey).script),
      covenantId: o.covenant !== undefined && o.covenant !== null
    }))
  };
}

/** Compute and transient masses (no UTXO context needed). */
export function nonContextualMasses(tx: KaspaRpcTransaction): { size: bigint; computeMass: bigint; transientMass: bigint } {
  return v1NonContextualMasses(massShapeOf(tx));
}

export function computeMass(tx: KaspaRpcTransaction): bigint {
  return nonContextualMasses(tx).computeMass;
}

export function transientMass(tx: KaspaRpcTransaction): bigint {
  return nonContextualMasses(tx).transientMass;
}

/** Estimated serialized size (mass/mod.rs), v1 bytes included. */
export function serializedSize(tx: KaspaRpcTransaction): bigint {
  return v1EstimatedSerializedSize(massShapeOf(tx));
}

/**
 * KIP-9 storage mass of plain (P2PK-sized, no covenant) UTXOs from their amounts only; undefined if an amount is 0 or
 * the mass overflows. Use measureTransactionMass when the UTXOs are known (scripts and covenants change the plurality).
 */
export function storageMass(inputAmounts: readonly bigint[], outputAmounts: readonly bigint[]): bigint | undefined {
  if (inputAmounts.length === 0 || inputAmounts.some((v) => v <= 0n) || outputAmounts.some((v) => v <= 0n)) return undefined;
  const cell = (amountSompi: bigint): V1StorageCell => ({ amountSompi, scriptBytes: 34, covenantId: false });
  return v1StorageMass(inputAmounts.map(cell), outputAmounts.map(cell));
}

/** Masses from the input amounts only (plain UTXOs assumed for the inputs); see measureTransactionMass. */
export function transactionMass(
  tx: KaspaRpcTransaction,
  inputAmounts?: readonly bigint[],
  enableStorageMass: boolean = true
): TransactionMass {
  const { computeMass: c, transientMass: t } = nonContextualMasses(tx);
  let s = 0n;
  if (enableStorageMass && inputAmounts && inputAmounts.length > 0) {
    const inputs = inputAmounts.map((amountSompi) => ({ amountSompi, scriptBytes: 34, covenantId: false }));
    s = v1StorageMass(inputs, storageCellsOf(tx, []).outputs) ?? 0n;
  }
  const m = [c, t, s].reduce((a, b) => (b > a ? b : a), 0n);
  return { computeMass: c, transientMass: t, storageMass: s, mass: m };
}

/** The node's masses of a transaction spending `spent` (tx-builder measureV1Mass), and the mass it is relayed by. */
export function measureTransactionMass(tx: KaspaRpcTransaction, spent: readonly SimulatorUtxo[]): MeasuredTransactionMass {
  const m = measureV1Mass(massShapeOf(tx), storageCellsOf(tx, spent));
  const feeMass = v1FeeMass(m);
  const priorityMass = feeMass > m.storageMass ? feeMass : m.storageMass;
  const mass = [m.computeMass, m.transientMass, m.storageMass].reduce((a, b) => (b > a ? b : a), 0n);
  return {
    computeMass: m.computeMass,
    transientMass: m.transientMass,
    storageMass: m.storageMass,
    mass,
    feeMass,
    priorityMass,
    withinBlockLimits: m.withinBlockLimits
  };
}

/** The verdict of checkMassCommitment; the messages are the node's (consensus/core/src/errors/tx.rs). */
export type MassCommitmentCheck =
  | { readonly ok: true; readonly storageMass: bigint }
  | { readonly ok: false; readonly code: "WrongMass"; readonly error: string; readonly calculated: bigint; readonly committed: bigint }
  | { readonly ok: false; readonly code: "MassIncomputable"; readonly error: string; readonly committed: bigint };

/**
 * SIM-07 point 9 · tx_validation_in_utxo_context.rs `check_mass_commitment`: a block's transaction must commit (its `mass`
 * field, 0 when absent) exactly the contextual storage mass the node calculates from the UTXOs it spends (KIP-9 with the
 * Toccata plurality, through @hardkas/tx-builder). The mempool does not run it (SkipMassCheck): it sets the mass instead.
 */
export function checkMassCommitment(tx: KaspaRpcTransaction, spent: readonly SimulatorUtxo[]): MassCommitmentCheck {
  const committed = BigInt(tx.mass ?? 0);
  let calculated: bigint | undefined;
  try {
    const cells = storageCellsOf(tx, spent);
    calculated = v1StorageMass(cells.inputs, cells.outputs);
  } catch {
    calculated = undefined;
  }
  if (calculated === undefined) {
    return { ok: false, code: "MassIncomputable", error: "contextual mass (including storage mass) is incomputable", committed };
  }
  if (committed !== calculated) {
    return {
      ok: false,
      code: "WrongMass",
      error: `calculated contextual mass (including storage mass) ${calculated} is not equal to the committed mass field ${committed}`,
      calculated,
      committed
    };
  }
  return { ok: true, storageMass: calculated };
}

/**
 * check_transaction_standard.rs `minimum_required_transaction_relay_fee`: fee mass × rate (sompi per gram), at least
 * 1000 grams' worth when that rounds to zero, at most MAX_SOMPI.
 */
export function minimumRelayFee(feeMass: bigint, feeRateSompiPerGram: bigint = DEFAULT_MINIMUM_RELAY_FEERATE): bigint {
  const perKg = feeRateSompiPerGram * 1000n;
  let fee = (feeMass * perKg) / 1000n;
  if (fee === 0n && perKg > 0n) fee = perKg;
  return fee > V1_MASS_PARAMS.maxSompi ? V1_MASS_PARAMS.maxSompi : fee;
}
