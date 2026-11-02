/*
 * F1.2 · mass and fee of a transaction, computed as the node computes them (rusty-kaspa 2.1.0), not as the SDK does.
 *
 * kaspa-wasm 2.1.0's mass calculator (wallet/core/src/tx/mass.rs) does not count v1 compute budgets nor the v1 bytes, adds
 * a signature allowance per input, prices the payload at 2 g/B and charges the storage mass; its storage mass ignores the
 * KIP-9 plurality of covenant UTXOs. For v1 none of that is the node's rule, so HardKAS computes it here, term by term,
 * from the node's source (the references name the rusty-kaspa 2.1.0 file and function of each term). Research and the
 * resolved contradiction: hkl1\f12\F1.2-RESEARCH.md. Until a node certifies a class (simnet, floor accepted and floor - 1
 * refused), a fee from these formulas is a floor, never the fee HardKAS pays without a limit: see v1MinimumRelayFee.
 */

/** Consensus and mempool parameters used below (identical on every network in rusty-kaspa 2.1.0). */
export const V1_MASS_PARAMS = Object.freeze({
  /** consensus/core/src/config/params.rs `mass_per_tx_byte` */
  massPerTxByte: 1n,
  /** params.rs `mass_per_script_pub_key_byte` */
  massPerScriptPubKeyByte: 10n,
  /** consensus/core/src/mass/units.rs `GRAMS_PER_COMPUTE_BUDGET_UNIT` (v1 inputs) */
  gramsPerComputeBudgetUnit: 100n,
  /** mass/units.rs `GRAMS_PER_SIGOP_COUNT_UNIT` (v0 inputs) */
  gramsPerSigOpCountUnit: 1000n,
  /** consensus/core/src/constants.rs `TRANSIENT_BYTE_TO_MASS_FACTOR` */
  transientByteToMassFactor: 4n,
  /** params.rs `storage_mass_parameter` = SOMPI_PER_KASPA × 10,000 (KIP-9 C) */
  storageMassParameter: 1_000_000_000_000n,
  /** params.rs block mass limits: the cofactors of the mempool's normalized transient mass come from them */
  blockLimits: Object.freeze({ compute: 500_000n, storage: 500_000n, transient: 1_000_000n }),
  /** mining/src/mempool/config.rs `minimum_relay_transaction_fee` (sompi per kg of mass) */
  minimumRelayTransactionFee: 100_000n,
  /** consensus/core/src/constants.rs `MAX_SOMPI` */
  maxSompi: 29_000_000_000n * 100_000_000n,
  /** KIP-9 storage: fixed UTXO bytes (32 txid + 4 index + 8 amount + 8 daa score + 1 coinbase + 2 spk version + 8 spk length) */
  utxoConstStorage: 63n,
  /** KIP-9 storage: bytes per plurality unit */
  utxoUnitSize: 100n,
  /** a covenant id: 32 bytes of storage, and 2 + 32 bytes of output binding in the serialized size */
  covenantIdBytes: 32n,
  covenantBindingBytes: 34n,
  /** consensus/core/src/config/params.rs: inputs and outputs per transaction */
  maxTxInputs: 1000,
  maxTxOutputs: 1000,
  /** params.rs `max_signature_script_len` */
  maxSignatureScriptBytes: 250_000
});

/** What the node measures of one input. */
export interface V1MassInputShape {
  readonly signatureScriptBytes: number;
  /** v1 inputs commit a compute budget (u16); v0 inputs a sig-op count. */
  readonly computeBudget?: number | undefined;
  readonly sigOpCount?: number | undefined;
}

/** What the node measures of one output. */
export interface V1MassOutputShape {
  readonly scriptBytes: number;
  /** True when the output carries a covenant binding (v1 only). */
  readonly covenant: boolean;
}

export interface V1MassTxShape {
  readonly version: number;
  readonly inputs: readonly V1MassInputShape[];
  readonly outputs: readonly V1MassOutputShape[];
  readonly payloadBytes: number;
}

/** A UTXO (spent or created) as KIP-9 storage mass sees it. */
export interface V1StorageCell {
  readonly amountSompi: bigint;
  readonly scriptBytes: number;
  readonly covenantId: boolean;
}

function massError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const count = (n: number, what: string): bigint => {
  if (!Number.isSafeInteger(n) || n < 0) throw massError("V1_MASS_SHAPE_INVALID", `${what}: ${n} is not a byte count`);
  return BigInt(n);
};

/**
 * Estimated serialized size, mass/mod.rs `transaction_estimated_serialized_size` and the input/output helpers: the
 * sig-op count is not counted; a v1 input adds 2 bytes (compute budget) and an output with a covenant 34 (2 authorizing
 * input + 32 covenant id).
 */
export function v1EstimatedSerializedSize(shape: V1MassTxShape): bigint {
  let size = 2n + 8n; // version (u16), number of inputs (u64)
  for (const [i, input] of shape.inputs.entries()) {
    size += 32n + 4n; // outpoint: transaction id + index
    size += 8n + count(input.signatureScriptBytes, `input ${i} signature script`);
    size += 8n; // sequence
    if (shape.version >= 1) size += 2n; // compute_budget (u16)
  }
  size += 8n; // number of outputs
  for (const [i, output] of shape.outputs.entries()) {
    size += 8n; // value
    size += 2n; // script public key version (u16)
    size += 8n + count(output.scriptBytes, `output ${i} script`);
    if (output.covenant) size += V1_MASS_PARAMS.covenantBindingBytes;
  }
  size += 8n; // lock time
  size += 20n; // subnetwork id
  size += 8n; // gas
  size += 32n; // payload hash
  size += 8n + count(shape.payloadBytes, "payload");
  return size;
}

export interface V1NonContextualMasses {
  readonly size: bigint;
  readonly computeMass: bigint;
  readonly transientMass: bigint;
}

/**
 * mass/mod.rs `MassCalculator::calc_non_contextual_masses`: compute = size × mass_per_tx_byte + Σ outputs (2 + script)
 * × mass_per_script_pub_key_byte + (v1: Σ compute budget × 100 g; v0: Σ sig-op count × 1000 g); transient = size × 4.
 * A covenant binding adds to the size, not to the script public key term.
 */
export function v1NonContextualMasses(shape: V1MassTxShape): V1NonContextualMasses {
  const p = V1_MASS_PARAMS;
  const size = v1EstimatedSerializedSize(shape);
  let spkBytes = 0n;
  for (const [i, output] of shape.outputs.entries()) spkBytes += 2n + count(output.scriptBytes, `output ${i} script`);
  let scriptMass = 0n;
  if (shape.version >= 1) {
    for (const [i, input] of shape.inputs.entries()) {
      const budget = input.computeBudget;
      if (budget === undefined || !Number.isInteger(budget) || budget < 0 || budget > 0xffff) {
        throw massError("V1_MASS_SHAPE_INVALID", `input ${i}: a v1 input needs a u16 compute budget, got ${budget}`);
      }
      scriptMass += BigInt(budget) * p.gramsPerComputeBudgetUnit;
    }
  } else {
    for (const [i, input] of shape.inputs.entries()) {
      const sigOps = input.sigOpCount;
      if (sigOps === undefined || !Number.isInteger(sigOps) || sigOps < 0 || sigOps > 0xff) {
        throw massError("V1_MASS_SHAPE_INVALID", `input ${i}: a v0 input needs a u8 sig-op count, got ${sigOps}`);
      }
      scriptMass += BigInt(sigOps) * p.gramsPerSigOpCountUnit;
    }
  }
  return {
    size,
    computeMass: size * p.massPerTxByte + spkBytes * p.massPerScriptPubKeyByte + scriptMass,
    transientMass: size * p.transientByteToMassFactor
  };
}

/** mass/mod.rs `utxo_plurality`: ⌈(63 + script bytes + 32 if it carries a covenant id) / 100⌉. */
export function v1UtxoPlurality(scriptBytes: number, covenantId: boolean): bigint {
  const p = V1_MASS_PARAMS;
  const bytes = p.utxoConstStorage + count(scriptBytes, "script") + (covenantId ? p.covenantIdBytes : 0n);
  return (bytes + p.utxoUnitSize - 1n) / p.utxoUnitSize;
}

/**
 * mass/mod.rs `calc_storage_mass` (KIP-9 with the Toccata plurality), integer arithmetic as the node does it:
 * - outputs: harmonic Σ C·p·p / v (multiplications first, then one integer division; overflow → undefined, the node's
 *   None), and their plurality;
 * - relaxed formula when the outputs' plurality is 1, or with at most 2 inputs whose plurality is 1, or outputs and
 *   inputs both of plurality 2: harmonic(outputs) − harmonic(inputs), saturating;
 * - otherwise: mean = max(Σ input values / inputs' plurality, 1); arithmetic = inputs' plurality × (C / mean);
 *   harmonic(outputs) − arithmetic, saturating.
 * A coinbase transaction has storage mass 0 (not handled here: HardKAS never builds one).
 */
export function v1StorageMass(inputs: readonly V1StorageCell[], outputs: readonly V1StorageCell[]): bigint | undefined {
  const C = V1_MASS_PARAMS.storageMassParameter;
  const U64_MAX = 2n ** 64n - 1n;
  const cell = (c: V1StorageCell, where: string) => {
    if (typeof c.amountSompi !== "bigint" || c.amountSompi <= 0n) throw massError("V1_MASS_SHAPE_INVALID", `${where}: amount must be a positive bigint`);
    return { amount: c.amountSompi, plurality: v1UtxoPlurality(c.scriptBytes, c.covenantId) };
  };
  const outs = outputs.map((c, i) => cell(c, `output ${i}`));
  const ins = inputs.map((c, i) => cell(c, `input ${i}`));
  if (ins.length === 0) throw massError("V1_MASS_SHAPE_INVALID", "a transaction without inputs has no storage mass to compute");

  let outsPlurality = 0n;
  let harmonicOuts = 0n;
  for (const o of outs) {
    const term = (C * o.plurality * o.plurality) / o.amount;
    if (C * o.plurality * o.plurality > U64_MAX) return undefined; // checked_mul
    outsPlurality += o.plurality;
    harmonicOuts += term;
    if (harmonicOuts > U64_MAX) return undefined; // checked_add
  }
  const insPlurality = ins.reduce((s, i) => s + i.plurality, 0n);
  const relaxed = outsPlurality === 1n || (ins.length <= 2 && (insPlurality === 1n || (outsPlurality === 2n && insPlurality === 2n)));
  const saturatingSub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);
  if (relaxed) {
    let harmonicIns = 0n;
    for (const i of ins) {
      harmonicIns += (C * i.plurality * i.plurality) / i.amount;
      if (harmonicIns > U64_MAX) harmonicIns = U64_MAX; // saturating_add
    }
    return saturatingSub(harmonicOuts, harmonicIns);
  }
  const sumIns = ins.reduce((s, i) => s + i.amount, 0n);
  let meanIns = sumIns / insPlurality;
  if (meanIns < 1n) meanIns = 1n;
  let arithmeticIns = insPlurality * (C / meanIns);
  if (arithmeticIns > U64_MAX) arithmeticIns = U64_MAX; // saturating_mul
  return saturatingSub(harmonicOuts, arithmeticIns);
}

/**
 * mining/src/mempool/check_transaction_standard.rs: the mass the relay fee is charged on is the larger of the compute mass
 * and the transient mass normalized by the block-limit cofactor (compute limit / transient limit = 0.5, rounded up as the
 * node's `ceil`). The storage mass has no relay-fee floor of its own.
 */
export function v1FeeMass(masses: Pick<V1NonContextualMasses, "computeMass" | "transientMass">): bigint {
  const { compute, transient } = V1_MASS_PARAMS.blockLimits;
  const normalizedTransient = (masses.transientMass * compute + transient - 1n) / transient;
  return masses.computeMass > normalizedTransient ? masses.computeMass : normalizedTransient;
}

/** check_transaction_standard.rs `minimum_required_transaction_relay_fee`: mass × 100,000 / 1000, at least 100,000, at most MAX_SOMPI. */
export function v1MinimumRelayFee(feeMass: bigint): bigint {
  const p = V1_MASS_PARAMS;
  let fee = (feeMass * p.minimumRelayTransactionFee) / 1000n;
  if (fee === 0n) fee = p.minimumRelayTransactionFee;
  return fee > p.maxSompi ? p.maxSompi : fee;
}

export interface V1MassMeasure extends V1NonContextualMasses {
  readonly storageMass: bigint;
  readonly feeMass: bigint;
  readonly minimumFeeSompi: bigint;
  /** Each mass within its block limit (the node has no other "standard" mass limit). */
  readonly withinBlockLimits: boolean;
  readonly authority: string;
}

export const V1_MASS_AUTHORITY = "rusty-kaspa 2.1.0 node rules (computed by HardKAS; certified per class only in simnet)";

/** The node's masses and minimum relay fee of a transaction; storage mass from its spent and created UTXOs. */
export function measureV1Mass(shape: V1MassTxShape, storage: { inputs: readonly V1StorageCell[]; outputs: readonly V1StorageCell[] }): V1MassMeasure {
  const masses = v1NonContextualMasses(shape);
  const storageMass = v1StorageMass(storage.inputs, storage.outputs);
  if (storageMass === undefined) throw massError("TX_MASS_ABOVE_STANDARD_LIMIT", "storage mass overflows (the node refuses the transaction)");
  const feeMass = v1FeeMass(masses);
  const limits = V1_MASS_PARAMS.blockLimits;
  return {
    ...masses,
    storageMass,
    feeMass,
    minimumFeeSompi: v1MinimumRelayFee(feeMass),
    withinBlockLimits: masses.computeMass <= limits.compute && storageMass <= limits.storage && masses.transientMass <= limits.transient,
    authority: V1_MASS_AUTHORITY
  };
}

/** Refuses a transaction whose masses exceed a block limit (the node could never include it). */
export function assertV1MassWithinLimits(m: V1MassMeasure): void {
  if (!m.withinBlockLimits) {
    const l = V1_MASS_PARAMS.blockLimits;
    throw massError(
      "TX_MASS_ABOVE_STANDARD_LIMIT",
      `compute ${m.computeMass}/${l.compute}, storage ${m.storageMass}/${l.storage}, transient ${m.transientMass}/${l.transient}: above the node's block limit`
    );
  }
}

const hexBytes = (hex: unknown): number => {
  const s = typeof hex === "string" ? hex : hex === undefined || hex === null ? "" : String(hex);
  return s.length / 2;
};

/**
 * The mass shape of a kaspa-wasm `Transaction` (as built: signature scripts, compute budgets, outputs with or without a
 * covenant binding, payload). Reads only public getters.
 */
export function v1MassShapeOfWasmTransaction(tx: any): V1MassTxShape {
  const version = Number(tx.version);
  const inputs = Array.from(tx.inputs as ArrayLike<any>).map((input: any) => ({
    signatureScriptBytes: hexBytes(input.signatureScript),
    computeBudget: version >= 1 ? Number(input.computeBudget ?? 0) : undefined,
    sigOpCount: version >= 1 ? undefined : Number(input.sigOpCount ?? 0)
  }));
  const outputs = Array.from(tx.outputs as ArrayLike<any>).map((output: any) => {
    const spk = output.scriptPublicKey;
    const script = typeof spk?.script === "string" ? spk.script : typeof spk?.serializeToObject === "function" ? spk.serializeToObject().script : "";
    return { scriptBytes: hexBytes(script), covenant: output.covenant !== undefined && output.covenant !== null };
  });
  return { version, inputs, outputs, payloadBytes: hexBytes(tx.payload) };
}
