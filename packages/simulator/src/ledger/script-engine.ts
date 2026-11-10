import type { KaspaSighashTransaction, KaspaSighashUtxo } from "../crypto/kaspa-sighash.js";
import { encodeKaspaAddress } from "../crypto/bech32.js";
import {
  ScriptVM,
  LOCK_TIME_THRESHOLD,
  MAX_TX_IN_SEQUENCE_NUM,
  SEQUENCE_LOCK_TIME_DISABLED,
  SEQUENCE_LOCK_TIME_MASK,
  type ScriptUtxoEntry
} from "../script/vm.js";
import { buildCovenantsContext, CovenantsError, type CovenantsContext } from "../script/covenants.js";
import type { KaspaRpcTransaction, SimulatorUtxo } from "../types.js";

/*
 * Transaction validation as rusty-kaspa v2.1.0 runs it for a mempool transaction (ACTIVE CONSENSUS), in the node's
 * order:
 *   1. in isolation (`tx_validation_in_isolation.rs`): input/output counts, script sizes, output values, duplicate
 *      inputs, gas, subnetwork, version, version-specific fields;
 *   2. in header context (`tx_validation_in_header_context.rs`): finality of the lock time (DAA score below
 *      LOCK_TIME_THRESHOLD = 5e11, past median time in ms above it; a not-yet-reached lock time is still final when
 *      every input's sequence is u64::MAX);
 *   3. in UTXO context (`tx_validation_in_utxo_context.rs`): coinbase maturity (when the caller passes it), input
 *      amounts, outputs not above inputs, sequence locks relative to each UTXO's block DAA score, covenant info
 *      (`CovenantsContext::from_tx`), then every input's scripts against its committed script units
 *      (v0: sigOpCount * 100 000 + 9 999; v1: computeBudget * 10 000 + 9 999).
 * Not checked here: the storage-mass commitment (WrongMass: the mempool sets the mass, as the node's with SkipMassCheck,
 * and block assembly checks it, `mass.ts` checkMassCommitment / `dag-chain.ts`) and the relay fee (`mempool.ts`). One policy rule the node does not have is kept: outputs below DUST_LIMIT_SOMPI (600) are refused;
 * the node refuses such outputs through KIP-9 storage mass instead, so only the reason differs.
 * Every rejection carries a stable `code` (TX_* / SCRIPT_*) and the node's message.
 */

export const DUST_LIMIT_SOMPI = 600n;

/** constants.rs */
export const MAX_SOMPI = 29_000_000_000n * 100_000_000n;
export const TX_VERSION_TOCCATA = 1;
/** config/params.rs:615-621 (all networks). */
export const MAX_TX_INPUTS = 1000;
export const MAX_TX_OUTPUTS = 1000;
export const MAX_SIGNATURE_SCRIPT_LEN = 250_000;
export const MAX_SCRIPT_PUBLIC_KEY_LEN = 10_000;
/** units.rs: SCRIPT_UNITS_PER_SIGOP_COUNT_UNIT, SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT, free_script_units_per_input(). */
export const SCRIPT_UNITS_PER_SIGOP_COUNT_UNIT = 100_000n;
export const SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT = 10_000n;
export const FREE_SCRIPT_UNITS_PER_INPUT = SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT - 1n;

const U64_MAX = (1n << 64n) - 1n;
const SUBNETWORK_COINBASE_FIRST_BYTE = 0x01;

const SCHNORR_P2PK_REGEX = /^(?:0000)?20([0-9a-f]{64})ac$/i;
/** A standard P2PK signature script: OP_DATA_65 <64-byte Schnorr signature> <sighash type>. */
const SIGNATURE_PUSH_REGEX = /^41([0-9a-f]{128})([0-9a-f]{2})$/i;
const STANDARD_SCRIPT_REGEX = /^(?:20[0-9a-f]{64}ac|21[0-9a-f]{66}ab|aa20[0-9a-f]{64}87)$/;

function hexToBytes(s: string): Uint8Array {
  const clean = s.replace(/^0x/, "").toLowerCase();
  if (!clean) return new Uint8Array(0);
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) throw new Error(`'${s.slice(0, 16)}…' is not hex`);
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

export interface ScriptValidationResult {
  readonly valid: boolean;
  readonly feeSompi: bigint;
  /** "<CODE>: <message>" when invalid. */
  readonly error?: string;
  /** Stable rejection code (TX_* for transaction rules, TX_SCRIPT_FAILED wrapping a SCRIPT_* failure). */
  readonly code?: string;
  /** For TX_SCRIPT_FAILED: the engine's SCRIPT_* code. */
  readonly scriptCode?: string;
  readonly failingInputIndex?: number;
}

export interface ValidateTransactionOptions {
  /**
   * Past median time (ms) of the virtual block, against which a time lock time (>= 5e11) is checked. Defaults to the
   * wall clock, which is later than the past median time of a live network.
   */
  readonly pastMedianTimeMs?: bigint;
  /** When given, coinbase UTXOs younger than this many DAA are refused (ImmatureCoinbaseSpend). */
  readonly coinbaseMaturity?: bigint;
}

export function extractPublicKeyFromScriptPublicKey(spkHex: string): string | undefined {
  const match = SCHNORR_P2PK_REGEX.exec(spkHex.trim().toLowerCase());
  return match ? match[1] : undefined;
}

/** The signature of a standard P2PK signature script (exactly OP_DATA_65 followed by 65 bytes). */
export function extractSignatureFromSignatureScript(sigScriptHex: string): { signature: string; sighashType: number } | undefined {
  const match = SIGNATURE_PUSH_REGEX.exec(sigScriptHex.trim().toLowerCase());
  if (!match) return undefined;
  const sig = match[1]! + match[2]!;
  const sighashType = parseInt(match[2]!, 16);
  return { signature: sig, sighashType };
}

export function extractAddressFromScriptPublicKey(spkHex: string, prefix: string = "kaspa"): string | undefined {
  const clean = spkHex.trim().toLowerCase().replace(/^0x/, "");
  const script = clean.startsWith("0000") ? clean.slice(4) : clean;
  // P2PK Schnorr: 20 <32 bytes (64 hex)> ac
  const schnorr = /^20([0-9a-f]{64})ac$/.exec(script);
  if (schnorr) {
    return encodeKaspaAddress(prefix, 0, hexToBytes(schnorr[1]!));
  }
  // P2PK ECDSA: 21 <33 bytes (66 hex)> ab
  const ecdsa = /^21([0-9a-f]{66})ab$/.exec(script);
  if (ecdsa) {
    return encodeKaspaAddress(prefix, 1, hexToBytes(ecdsa[1]!));
  }
  // P2SH: aa20 <32 bytes (64 hex)> 87
  const p2sh = /^aa20([0-9a-f]{64})87$/.exec(script);
  if (p2sh) {
    return encodeKaspaAddress(prefix, 8, hexToBytes(p2sh[1]!));
  }
  return undefined;
}

/**
 * The script public key a UTXO locks with. With `scriptPublicKeyVersion` set, `scriptPublicKey` is the bare script.
 * Without it (legacy records), a "0000" version prefix is removed only in front of a standard script, so a bare
 * script that happens to start with OP_FALSE OP_FALSE is not truncated.
 */
export function utxoScriptPublicKey(utxo: SimulatorUtxo): { version: number; script: string } {
  const raw = utxo.scriptPublicKey.toLowerCase().replace(/^0x/, "");
  if (utxo.scriptPublicKeyVersion !== undefined) return { version: utxo.scriptPublicKeyVersion, script: raw };
  if (raw.startsWith("0000") && STANDARD_SCRIPT_REGEX.test(raw.slice(4))) return { version: 0, script: raw.slice(4) };
  return { version: 0, script: raw };
}

/** The covenant id a UTXO carries (UtxoEntry.covenant_id). */
export function utxoCovenantId(utxo: SimulatorUtxo): string | undefined {
  const id = utxo.covenantId ?? utxo.covenant?.covenantId;
  return id === undefined ? undefined : id.toLowerCase();
}

/** ComputeCommit::allowed_script_units for one input. */
export function allowedScriptUnits(
  version: number,
  input: { readonly sigOpCount?: number | undefined; readonly computeBudget?: number | undefined }
): bigint {
  const committed =
    version >= TX_VERSION_TOCCATA
      ? BigInt(input.computeBudget ?? 0) * SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT
      : BigInt(input.sigOpCount ?? 1) * SCRIPT_UNITS_PER_SIGOP_COUNT_UNIT;
  return committed + FREE_SCRIPT_UNITS_PER_INPUT;
}

class TxRuleError extends Error {
  constructor(readonly code: string, readonly detail: string, readonly failingInputIndex?: number, readonly scriptCode?: string) {
    super(`${code}: ${detail}`);
  }
}

const reject = (code: string, detail: string, failingInputIndex?: number, scriptCode?: string) =>
  new TxRuleError(code, detail, failingInputIndex, scriptCode);

function toBigInt(v: bigint | number | string | undefined, what: string): bigint {
  try {
    return BigInt(v ?? 0);
  } catch {
    throw reject("TX_INVALID_FIELD", `${what} is not an integer`);
  }
}

/**
 * Validates a Kaspa transaction against the UTXOs its inputs spend, at virtual DAA score `currentDaaScore`, as the
 * node validates a mempool transaction (see the header of this file). Never throws.
 */
export function validateTransactionScripts(
  tx: KaspaRpcTransaction,
  spentUtxos: ReadonlyArray<SimulatorUtxo>,
  currentDaaScore: bigint = 0n,
  options: ValidateTransactionOptions = {}
): ScriptValidationResult {
  let feeSompi = 0n;
  try {
    feeSompi = validate(tx, spentUtxos, currentDaaScore, options, (fee) => {
      feeSompi = fee;
    });
    return { valid: true, feeSompi };
  } catch (e: any) {
    if (e instanceof TxRuleError) {
      return {
        valid: false,
        feeSompi,
        error: e.message,
        code: e.code,
        ...(e.scriptCode !== undefined ? { scriptCode: e.scriptCode } : {}),
        ...(e.failingInputIndex !== undefined ? { failingInputIndex: e.failingInputIndex } : {})
      };
    }
    return { valid: false, feeSompi, error: `TX_INTERNAL_ERROR: ${String(e?.message ?? e)}`, code: "TX_INTERNAL_ERROR" };
  }
}

function validate(
  tx: KaspaRpcTransaction,
  spentUtxos: ReadonlyArray<SimulatorUtxo>,
  povDaaScore: bigint,
  options: ValidateTransactionOptions,
  reportFee: (fee: bigint) => void
): bigint {
  const inputs = tx.inputs ?? [];
  const outputs = tx.outputs ?? [];
  const version = Number(tx.version ?? 0);
  const subnetwork = hexToBytesOrReject(String(tx.subnetworkId ?? "00".repeat(20)), "subnetwork id");
  if (subnetwork.length !== 20) throw reject("TX_INVALID_FIELD", `subnetwork id must be 20 bytes, got ${subnetwork.length}`);
  const gas = toBigInt(tx.gas, "gas");
  const lockTime = toBigInt(tx.lockTime, "lock time");
  if (lockTime < 0n || lockTime > U64_MAX) throw reject("TX_INVALID_FIELD", `lock time ${lockTime} is not a u64`);

  // ── 1. In isolation ──
  const isCoinbase = subnetwork[0] === SUBNETWORK_COINBASE_FIRST_BYTE && subnetwork.subarray(1).every((b) => b === 0);
  if (!isCoinbase && inputs.length === 0) throw reject("TX_NO_INPUTS", "transaction has no inputs");
  if (inputs.length > MAX_TX_INPUTS) throw reject("TX_TOO_MANY_INPUTS", `transaction has ${inputs.length} inputs where the max allowed is ${MAX_TX_INPUTS}`);
  inputs.forEach((inp, i) => {
    const len = (inp.signatureScript ?? "").replace(/^0x/, "").length / 2;
    if (len > MAX_SIGNATURE_SCRIPT_LEN) {
      throw reject("TX_SIGNATURE_SCRIPT_TOO_BIG", `transaction input #${i} signature script is above ${MAX_SIGNATURE_SCRIPT_LEN} bytes`);
    }
  });
  if (!isCoinbase && outputs.length > MAX_TX_OUTPUTS) {
    throw reject("TX_TOO_MANY_OUTPUTS", `transaction has ${outputs.length} outputs where the max allowed is ${MAX_TX_OUTPUTS}`);
  }
  outputs.forEach((out, i) => {
    const len = String(out.scriptPublicKey?.scriptPublicKey ?? "").replace(/^0x/, "").length / 2;
    if (len > MAX_SCRIPT_PUBLIC_KEY_LEN) {
      throw reject("TX_SCRIPT_PUBLIC_KEY_TOO_BIG", `transaction output #${i} script public key is above ${MAX_SCRIPT_PUBLIC_KEY_LEN} bytes`);
    }
  });
  if (isCoinbase) throw reject("TX_COINBASE_HAS_INPUTS", `coinbase transaction has ${inputs.length} inputs while none are expected`);

  let totalOut = 0n;
  const outputValues = outputs.map((out, i) => {
    const value = toBigInt(out.amount, `output ${i} value`);
    if (value < 0n || value > U64_MAX) throw reject("TX_INVALID_FIELD", `transaction output ${i} value ${value} is not a u64`);
    if (value === 0n) throw reject("TX_OUT_ZERO", `transaction output ${i} has zero value`);
    if (value > MAX_SOMPI) throw reject("TX_OUT_TOO_HIGH", `transaction output ${i} value is higher than the max allowed of ${MAX_SOMPI}`);
    totalOut += value;
    if (totalOut > U64_MAX) throw reject("TX_OUTPUTS_VALUE_OVERFLOW", "transaction total outputs value overflowed u64");
    if (totalOut > MAX_SOMPI) throw reject("TX_TOTAL_OUT_TOO_HIGH", `transaction total outputs value is higher than the max allowed of ${MAX_SOMPI}`);
    return value;
  });

  const seen = new Set<string>();
  for (const inp of inputs) {
    const key = `${String(inp.previousOutpoint.transactionId).toLowerCase()}:${Number(inp.previousOutpoint.index)}`;
    if (seen.has(key)) throw reject("TX_DUPLICATE_INPUTS", "transaction has duplicate inputs");
    seen.add(key);
  }

  const reservedShape = subnetwork.subarray(1).every((b) => b === 0);
  if (gas !== 0n) {
    if (version < TX_VERSION_TOCCATA) throw reject("TX_HAS_GAS", "transaction has non-zero gas: gas is not allowed before Toccata");
    if (reservedShape) throw reject("TX_HAS_GAS", "transaction has non-zero gas: reserved subnetworks cannot carry gas");
  }
  const subnetworkOk = reservedShape
    ? subnetwork[0] === 0x00 || subnetwork[0] === SUBNETWORK_COINBASE_FIRST_BYTE
    : version >= TX_VERSION_TOCCATA && subnetwork.subarray(4).every((b) => b === 0);
  if (!subnetworkOk) throw reject("TX_SUBNETWORKS_DISABLED", `transaction subnetwork id ${Buffer.from(subnetwork).toString("hex")} is neither native nor coinbase`);

  if (!Number.isInteger(version) || version < 0 || version > TX_VERSION_TOCCATA) throw reject("TX_UNKNOWN_VERSION", `transaction version ${version} is unknown`);

  if (version >= TX_VERSION_TOCCATA) {
    inputs.forEach((inp, i) => {
      if (inp.sigOpCount !== undefined && Number(inp.sigOpCount) > 0) {
        // What the node's RPC layer answers before consensus sees the transaction (SigopCountInV1 in consensus).
        throw reject("TX_SIGOP_COUNT_IN_V1", `RpcTransactionInput.sig_op_count is inconsistent with transaction version 1 (transaction input #${i} has a sig op count field with value ${inp.sigOpCount} in version 1 transaction)`);
      }
    });
    outputs.forEach((out, i) => {
      const cov = out.covenant;
      if (!cov) return;
      if (typeof cov.covenantId !== "string" || !/^[0-9a-f]{64}$/i.test(cov.covenantId)) {
        throw reject("TX_INVALID_COVENANT_BINDING", `Output ${i}: invalid covenant binding, covenantId must be 32-byte hex string`);
      }
      if (typeof cov.authorizingInput !== "number" || !Number.isInteger(cov.authorizingInput) || cov.authorizingInput < 0 || cov.authorizingInput > 0xffff) {
        throw reject("TX_INVALID_COVENANT_BINDING", `Output ${i}: invalid covenant binding, authorizingInput ${String(cov.authorizingInput)} is not a u16`);
      }
    });
  } else {
    inputs.forEach((inp, i) => {
      if (inp.computeBudget !== undefined && Number(inp.computeBudget) > 0) {
        throw reject("TX_COMPUTE_BUDGET_IN_V0", `transaction input #${i} has a compute budget field with value ${inp.computeBudget} in version 0 transaction`);
      }
    });
    outputs.forEach((out, i) => {
      if (out.covenant !== undefined && out.covenant !== null) {
        throw reject("TX_COVENANT_BINDING_IN_V0", `transaction output #${i} has covenant field but transaction version is 0`);
      }
    });
  }

  // Simulator policy (see the file header).
  outputValues.forEach((value, i) => {
    if (value < DUST_LIMIT_SOMPI) throw reject("TX_OUTPUT_DUST", `Output ${i} amount (${value}) is below dust limit (${DUST_LIMIT_SOMPI})`);
  });

  // ── 2. In header context: finality ──
  if (lockTime !== 0n) {
    const reference = lockTime < LOCK_TIME_THRESHOLD ? povDaaScore : options.pastMedianTimeMs ?? BigInt(Date.now());
    if (!(lockTime < reference)) {
      inputs.forEach((inp, i) => {
        if (BigInt.asUintN(64, toBigInt(inp.sequence, `input ${i} sequence`)) !== MAX_TX_IN_SEQUENCE_NUM) {
          throw reject("TX_NOT_FINALIZED", `transaction input #${i} is not finalized`);
        }
      });
    }
  }

  // ── 3. In UTXO context ──
  if (inputs.length !== spentUtxos.length) {
    throw reject("TX_MISSING_OUTPOINTS", `Input count mismatch: tx has ${inputs.length} inputs, but ${spentUtxos.length} UTXOs provided`);
  }
  if (options.coinbaseMaturity !== undefined) {
    spentUtxos.forEach((u, i) => {
      if (u.isCoinbase && u.blockDaaScore + options.coinbaseMaturity! > povDaaScore) {
        throw reject(
          "TX_IMMATURE_COINBASE_SPEND",
          `transaction input #${i} tried to spend coinbase outpoint ${u.transactionId}:${u.index} with daa score of ${u.blockDaaScore} while the merging block daa score is ${povDaaScore} and the coinbase maturity period of ${options.coinbaseMaturity} hasn't passed yet`
        );
      }
    });
  }
  let totalIn = 0n;
  for (const u of spentUtxos) {
    totalIn += u.amountSompi;
    if (totalIn > U64_MAX) throw reject("TX_INPUT_AMOUNT_OVERFLOW", "transaction total inputs spending amount overflowed u64");
    if (totalIn > MAX_SOMPI) throw reject("TX_INPUT_AMOUNT_TOO_HIGH", `transaction total inputs spending amount is higher than the max allowed of ${MAX_SOMPI}`);
  }
  if (totalIn < totalOut) {
    throw reject("TX_SPEND_TOO_HIGH", `Insufficient input funds: transaction tries to spend ${totalOut} while its total inputs amount is ${totalIn} (total inputs ${totalIn} sompi < total outputs ${totalOut} sompi)`);
  }
  const fee = totalIn - totalOut;
  reportFee(fee);

  const sequences = inputs.map((inp, i) => BigInt.asUintN(64, toBigInt(inp.sequence, `input ${i} sequence`)));
  const pov = BigInt.asIntN(64, povDaaScore);
  sequences.forEach((sequence, i) => {
    if ((sequence & SEQUENCE_LOCK_TIME_DISABLED) === SEQUENCE_LOCK_TIME_DISABLED) return;
    const lockDaaScore = BigInt.asIntN(64, spentUtxos[i]!.blockDaaScore) + (sequence & SEQUENCE_LOCK_TIME_MASK) - 1n;
    if (lockDaaScore >= pov) throw reject("TX_SEQUENCE_LOCK_NOT_MET", "one of the transaction sequence locks conditions was not met");
  });

  const sighashTx: KaspaSighashTransaction = {
    version,
    inputs: inputs.map((inp, i) => ({
      transactionId: String(inp.previousOutpoint.transactionId).toLowerCase(),
      index: Number(inp.previousOutpoint.index),
      sequence: sequences[i]!,
      sigOpCount: Number(inp.sigOpCount ?? (version >= TX_VERSION_TOCCATA ? 0 : 1))
    })),
    outputs: outputs.map((out, i) => ({
      value: outputValues[i]!,
      scriptPublicKey: {
        version: Number(out.scriptPublicKey.version ?? 0),
        script: String(out.scriptPublicKey.scriptPublicKey ?? "").replace(/^0x/, "").toLowerCase()
      },
      ...(out.covenant
        ? { covenant: { authorizingInput: Number(out.covenant.authorizingInput), covenantId: String(out.covenant.covenantId).toLowerCase() } }
        : {})
    })),
    lockTime,
    subnetworkId: Buffer.from(subnetwork).toString("hex"),
    gas,
    payload: String(tx.payload ?? "").replace(/^0x/, "").toLowerCase()
  };

  const signatureScripts = inputs.map((inp) => String(inp.signatureScript ?? "").replace(/^0x/, "").toLowerCase());

  const utxoEntries: ScriptUtxoEntry[] = spentUtxos.map((u) => {
    const covenantId = utxoCovenantId(u);
    return {
      amount: u.amountSompi,
      scriptPublicKey: utxoScriptPublicKey(u),
      blockDaaScore: u.blockDaaScore,
      isCoinbase: u.isCoinbase,
      ...(covenantId !== undefined ? { covenantId } : {})
    };
  });

  let covenants: CovenantsContext;
  try {
    covenants = buildCovenantsContext({
      inputs: sighashTx.inputs,
      outputs: sighashTx.outputs,
      inputCovenantIds: utxoEntries.map((u) => u.covenantId)
    });
  } catch (e) {
    if (e instanceof CovenantsError) throw reject("TX_COVENANTS_ERROR", e.message);
    throw e;
  }

  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i]!;
    const entry = utxoEntries[i]!;
    const sighashUtxo: KaspaSighashUtxo = { amount: entry.amount, scriptPublicKey: entry.scriptPublicKey };
    const vmRes = ScriptVM.execute(hexToBytes(signatureScripts[i]!), hexToBytes(entry.scriptPublicKey.script), {
      tx: sighashTx,
      inputIndex: i,
      utxo: sighashUtxo,
      utxos: utxoEntries,
      signatureScripts,
      covenants,
      currentDaaScore: povDaaScore,
      scriptUnitsLimit: allowedScriptUnits(version, { sigOpCount: sighashTx.inputs[i]!.sigOpCount, computeBudget: inp.computeBudget })
    });
    if (!vmRes.success) {
      const outpoint = `${inp.previousOutpoint.transactionId}:${inp.previousOutpoint.index}`;
      const standardP2pk = entry.scriptPublicKey.version === 0 && extractPublicKeyFromScriptPublicKey(entry.scriptPublicKey.script) !== undefined;
      const detail =
        standardP2pk && vmRes.code === "SCRIPT_EVAL_FALSE"
          ? `Input ${i}: invalid Schnorr signature for outpoint ${outpoint}: failed to verify the signature script: ${vmRes.error}`
          : `Input ${i} script execution failed: failed to verify the signature script: ${vmRes.error}`;
      throw reject("TX_SCRIPT_FAILED", detail, i, vmRes.code);
    }
  }

  return fee;
}

function hexToBytesOrReject(s: string, what: string): Uint8Array {
  try {
    return hexToBytes(s);
  } catch {
    throw reject("TX_INVALID_FIELD", `${what} is not hex`);
  }
}
