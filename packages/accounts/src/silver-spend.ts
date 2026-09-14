import {
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shLock,
  silverSigFromInputSignature,
  silverUnlockScript,
  type SilAbiArtifact,
  type SilArtifactValue
} from "@hardkas/core";
import { calculateUpstreamStorageMass, measureBuiltTransactionMass } from "@hardkas/tx-builder";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";

/**
 * Spending a SilverScript P2SH output.
 *
 * Every consensus-relevant piece comes from upstream: the lock and the unlock
 * layout from the SDK (see @hardkas/core silverscript-abi), the signature from
 * the SDK's `createInputSignature`, mass, fee and the storage-mass commitment
 * from the SDK's mass calculator. HardKAS only assembles them in order.
 */

function spendError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

/** A contract output as the node reports it. */
export interface SilverContractUtxo {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly amountSompi: bigint;
  readonly scriptPublicKey: { readonly version: number; readonly script: string };
  readonly blockDaaScore: bigint;
  readonly isCoinbase: boolean;
}

/** A `sig` argument: a Schnorr signature of this spend (SIGHASH_ALL) by the given key. */
export interface SilverSignatureArg {
  readonly kind: "signature";
  readonly privateKey: string;
}

export type SilverSpendArg = SilArtifactValue | SilverSignatureArg;

export interface SilverSweepRequest {
  readonly artifact: SilAbiArtifact;
  readonly contractName?: string | undefined;
  readonly entry: string;
  readonly args: readonly SilverSpendArg[];
  readonly utxo: SilverContractUtxo;
  /** Receives the whole value minus the fee. */
  readonly to: string;
  readonly networkId: string;
  /** Input sequence, for contracts with relative time locks. Default 0. */
  readonly sequence?: bigint | undefined;
  /** Declared signature operations of the input (script-execution budget). Default 1. */
  readonly sigOpCount?: number | undefined;
  /** Fee rate above the node minimum, sompi per gram. Default: the minimum. */
  readonly feeRateSompiPerGram?: bigint | undefined;
}

export interface SilverSpendResult {
  /** The signed WASM transaction. */
  readonly transaction: any;
  /** The transaction in RPC shape, ready for submitTransaction. */
  readonly rpcTransaction: any;
  readonly txId: string;
  readonly contractName: string;
  readonly entry: string;
  readonly outputSompi: bigint;
  readonly feeSompi: bigint;
  readonly mass: bigint;
  readonly storageMass: bigint;
  readonly signatureScriptHex: string;
  readonly assumptions: readonly string[];
}

const PLACEHOLDER_SIG: SilArtifactValue = { kind: "bytes", value: new Uint8Array(65) };

/**
 * Builds and signs a transaction spending one SilverScript contract output
 * entirely to `to`, through the named entry.
 *
 * Fails closed: the output must be locked to this contract's bytecode, the
 * fee must meet the SDK's minimum for the final transaction, and the signed
 * unlock must have the size the fee was computed for.
 */
export function buildSilverSweep(request: SilverSweepRequest): SilverSpendResult {
  const k = loadManagedKaspaWasmSync();
  const { name: contractName, contract } = getSilContract(request.artifact, request.contractName);
  const bytecode = silContractBytecodeHex(contract);

  const lock = silverP2shLock(bytecode);
  const utxoSpk = request.utxo.scriptPublicKey;
  if (Number(utxoSpk.version) !== lock.version || String(utxoSpk.script).toLowerCase() !== lock.script) {
    throw spendError(
      "SILVER_SPEND_LOCK_MISMATCH",
      `output ${request.utxo.outpoint.transactionId}:${request.utxo.outpoint.index} is not locked to contract '${contractName}'`
    );
  }
  if (!k.Address.validate(request.to)) throw spendError("SILVER_SPEND_INVALID_RECIPIENT", `'${request.to}' is not a Kaspa address`);

  const sequence = request.sequence ?? 0n;
  const sigOpCount = request.sigOpCount ?? 1;
  const amountIn = request.utxo.amountSompi;
  const { transactionId, index } = request.utxo.outpoint;

  const makeTx = (amountOut: bigint, signatureScript: string) => {
    const tx = new k.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: { transactionId, index },
          signatureScript,
          sequence,
          sigOpCount,
          utxo: {
            outpoint: { transactionId, index },
            amount: amountIn,
            scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script),
            blockDaaScore: request.utxo.blockDaaScore,
            isCoinbase: request.utxo.isCoinbase
          }
        }
      ],
      outputs: [{ value: amountOut, scriptPublicKey: k.payToAddressScript(new k.Address(request.to)) }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass([amountIn], [amountOut], request.networkId);
    return tx;
  };

  const entryArgs = (resolveSig: (a: SilverSignatureArg) => SilArtifactValue) =>
    encodeSilverEntryArgs({
      artifact: request.artifact,
      contractName,
      entry: request.entry,
      args: request.args.map((a) => (a.kind === "signature" ? resolveSig(a) : a))
    });

  // Price the final shape: signatures are fixed-size, so placeholders give the exact unlock length.
  const placeholderUnlock = silverUnlockScript(bytecode, entryArgs(() => PLACEHOLDER_SIG));
  // Storage mass depends on the output amount, which depends on the fee: raise
  // the fee until it covers the mass of the transaction it leaves behind.
  let fee = 0n;
  let priced: ReturnType<typeof measureBuiltTransactionMass> | undefined;
  let converged = false;
  for (let round = 0; round < 8 && !converged; round++) {
    const amountOut = amountIn - fee;
    if (amountOut <= 0n) throw spendError("SILVER_SPEND_INSUFFICIENT_VALUE", `output of ${amountIn} sompi cannot pay a fee of ${fee}`);
    priced = measureBuiltTransactionMass(makeTx(amountOut, placeholderUnlock), request.networkId);
    if (!priced.standard) {
      throw spendError("TX_MASS_ABOVE_STANDARD_LIMIT", `mass ${priced.mass} exceeds the maximum standard mass ${priced.maximumStandardMass}`);
    }
    const byRate = request.feeRateSompiPerGram !== undefined ? priced.mass * request.feeRateSompiPerGram : 0n;
    const required = priced.minimumFeeSompi > byRate ? priced.minimumFeeSompi : byRate;
    if (required <= fee) converged = true;
    else fee = required;
  }
  if (!priced || !converged) throw spendError("SILVER_SPEND_FEE_UNRESOLVED", "the fee did not converge");
  const amountOut = amountIn - fee;

  // Sign the final transaction. The sighash does not cover signature scripts,
  // so the signatures stay valid once the unlock is in place.
  const unsigned = makeTx(amountOut, "");
  const unlock = silverUnlockScript(
    bytecode,
    entryArgs((a) => ({
      kind: "bytes",
      value: silverSigFromInputSignature(String(k.createInputSignature(unsigned, 0, new k.PrivateKey(a.privateKey), k.SighashType.All)))
    }))
  );
  if (unlock.length !== placeholderUnlock.length) {
    throw spendError("SILVER_SPEND_UNLOCK_SIZE_CHANGED", "the signed unlock is not the size the fee was computed for");
  }
  const signed = makeTx(amountOut, unlock);

  return {
    transaction: signed,
    rpcTransaction: parseWasmTxToRpc(signed.serializeToObject()),
    txId: String(signed.id),
    contractName,
    entry: request.entry,
    outputSompi: amountOut,
    feeSompi: fee,
    mass: priced.mass,
    storageMass: BigInt(signed.storageMass),
    signatureScriptHex: unlock,
    assumptions: [...priced.assumptions, `sigOpCount ${sigOpCount}`]
  };
}

// ---------------------------------------------------------------------------
// Multi-party spends: prepare once, sign separately, finalize
// ---------------------------------------------------------------------------

export const SILVER_SPEND_DRAFT_SCHEMA = "hardkas.silver.spendDraft.v1";

/** A `sig` argument to be filled by a named signer (see signSilverSpend). */
export interface SilverSignerSlot {
  readonly kind: "signer";
  readonly signer: string;
}

export type SilverDraftArg = SilArtifactValue | SilverSignerSlot;

/**
 * An unsigned P2SH spend with fixed outputs, as plain JSON: it can be stored
 * and handed to each signer. Every signer signs the same transaction; the
 * signatures are placed into the entry's arguments only at finalization.
 */
export interface SilverSpendDraft {
  readonly schema: typeof SILVER_SPEND_DRAFT_SCHEMA;
  readonly networkId: string;
  readonly contractName: string;
  readonly entry: string;
  readonly signers: readonly string[];
  readonly input: {
    readonly outpoint: { readonly transactionId: string; readonly index: number };
    readonly amountSompi: string;
    readonly scriptPublicKey: { readonly version: number; readonly script: string };
    readonly blockDaaScore: string;
    readonly isCoinbase: boolean;
    readonly sequence: string;
    readonly sigOpCount: number;
  };
  readonly outputs: readonly { readonly valueSompi: string; readonly scriptPublicKey: { readonly version: number; readonly script: string } }[];
  readonly feeSompi: string;
  readonly mass: string;
  readonly storageMass: string;
  /** Hex length of the final signature script the fee was checked against. */
  readonly unlockHexLength: number;
  readonly unsignedTxId: string;
}

export interface SilverSpendDraftRequest {
  readonly artifact: SilAbiArtifact;
  readonly contractName?: string | undefined;
  readonly entry: string;
  /** Entry arguments; `sig` slots are named signers filled at finalization. */
  readonly args: readonly SilverDraftArg[];
  readonly utxo: SilverContractUtxo;
  /** The outputs exactly as the contract requires; the rest of the input value is the fee. */
  readonly outputs: readonly { readonly amountSompi: bigint; readonly address?: string; readonly scriptPublicKey?: { readonly version: number; readonly script: string } }[];
  readonly networkId: string;
  readonly sequence?: bigint | undefined;
  /** Declared signature operations; defaults to the number of signer slots. */
  readonly sigOpCount?: number | undefined;
}

function draftTx(k: any, draft: Omit<SilverSpendDraft, "unsignedTxId" | "feeSompi" | "mass" | "storageMass" | "unlockHexLength" | "schema" | "signers"> & { storageMass?: string }, signatureScript: string, networkId: string) {
  const i = draft.input;
  const tx = new k.Transaction({
    version: 0,
    inputs: [{
      previousOutpoint: i.outpoint,
      signatureScript,
      sequence: BigInt(i.sequence),
      sigOpCount: i.sigOpCount,
      utxo: {
        outpoint: i.outpoint,
        amount: BigInt(i.amountSompi),
        scriptPublicKey: new k.ScriptPublicKey(i.scriptPublicKey.version, i.scriptPublicKey.script),
        blockDaaScore: BigInt(i.blockDaaScore),
        isCoinbase: i.isCoinbase
      }
    }],
    outputs: draft.outputs.map((o) => ({ value: BigInt(o.valueSompi), scriptPublicKey: new k.ScriptPublicKey(o.scriptPublicKey.version, o.scriptPublicKey.script) })),
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  tx.storageMass = calculateUpstreamStorageMass([BigInt(i.amountSompi)], draft.outputs.map((o) => BigInt(o.valueSompi)), networkId);
  return tx;
}

function draftUnlock(artifact: SilAbiArtifact, contractName: string, entry: string, args: readonly SilverDraftArg[], fill: (slot: SilverSignerSlot) => SilArtifactValue): string {
  const { contract } = getSilContract(artifact, contractName);
  return silverUnlockScript(
    silContractBytecodeHex(contract),
    encodeSilverEntryArgs({ artifact, contractName, entry, args: args.map((a) => (a.kind === "signer" ? fill(a) : a)) })
  );
}

/**
 * Prepares a spend of one SilverScript output into fixed outputs. Fails
 * closed if the output is not locked to the contract or if what the outputs
 * leave as fee is below the SDK minimum for the final (signed) transaction.
 */
export function prepareSilverSpend(request: SilverSpendDraftRequest): SilverSpendDraft {
  const k = loadManagedKaspaWasmSync();
  const { name: contractName, contract } = getSilContract(request.artifact, request.contractName);
  const lock = silverP2shLock(silContractBytecodeHex(contract));
  const u = request.utxo;
  if (Number(u.scriptPublicKey.version) !== lock.version || String(u.scriptPublicKey.script).toLowerCase() !== lock.script) {
    throw spendError("SILVER_SPEND_LOCK_MISMATCH", `output ${u.outpoint.transactionId}:${u.outpoint.index} is not locked to contract '${contractName}'`);
  }
  const signers = request.args.filter((a): a is SilverSignerSlot => a.kind === "signer").map((a) => a.signer);
  const outputs = request.outputs.map((o, i) => {
    let spk = o.scriptPublicKey;
    if (!spk && o.address) {
      if (!k.Address.validate(o.address)) throw spendError("SILVER_SPEND_INVALID_RECIPIENT", `output ${i}: '${o.address}' is not a Kaspa address`);
      const s = k.payToAddressScript(new k.Address(o.address));
      spk = { version: Number(s.version), script: String(s.script) };
    }
    if (!spk || !/^(?:[0-9a-f]{2})+$/i.test(spk.script)) throw spendError("SILVER_SPEND_INVALID_RECIPIENT", `output ${i} has no script`);
    if (o.amountSompi <= 0n) throw spendError("SILVER_SPEND_INVALID_OUTPUT", `output ${i} has no value`);
    return { valueSompi: o.amountSompi.toString(), scriptPublicKey: { version: Number(spk.version), script: String(spk.script).toLowerCase() } };
  });
  const totalOut = outputs.reduce((s, o) => s + BigInt(o.valueSompi), 0n);
  if (totalOut > u.amountSompi) throw spendError("SILVER_SPEND_INSUFFICIENT_VALUE", `outputs ${totalOut} exceed the contract output ${u.amountSompi}`);

  const base = {
    networkId: request.networkId,
    contractName,
    entry: request.entry,
    input: {
      outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
      amountSompi: u.amountSompi.toString(),
      scriptPublicKey: { version: lock.version, script: lock.script },
      blockDaaScore: u.blockDaaScore.toString(),
      isCoinbase: u.isCoinbase,
      sequence: (request.sequence ?? 0n).toString(),
      sigOpCount: request.sigOpCount ?? Math.max(1, signers.length)
    },
    outputs
  };
  const placeholder = draftUnlock(request.artifact, contractName, request.entry, request.args, () => PLACEHOLDER_SIG);
  const priced = measureBuiltTransactionMass(draftTx(k, base, placeholder, request.networkId), request.networkId);
  if (!priced.standard) throw spendError("TX_MASS_ABOVE_STANDARD_LIMIT", `mass ${priced.mass} exceeds the maximum standard mass ${priced.maximumStandardMass}`);
  const fee = u.amountSompi - totalOut;
  if (fee < priced.minimumFeeSompi) {
    throw spendError("FEE_BELOW_NETWORK_MINIMUM", `the outputs leave ${fee} sompi of fee; the SDK minimum for this spend is ${priced.minimumFeeSompi}`);
  }
  const unsigned = draftTx(k, base, "", request.networkId);
  return {
    schema: SILVER_SPEND_DRAFT_SCHEMA,
    ...base,
    signers,
    feeSompi: fee.toString(),
    mass: priced.mass.toString(),
    storageMass: String(unsigned.storageMass),
    unlockHexLength: placeholder.length,
    unsignedTxId: String(unsigned.id)
  };
}

/** One signer's `sig` value (65-byte hex) for a draft, from the SDK's input signature. */
export function signSilverSpend(draft: SilverSpendDraft, privateKey: string): string {
  if (draft?.schema !== SILVER_SPEND_DRAFT_SCHEMA) throw spendError("SILVER_SPEND_DRAFT_INVALID", "not a SilverScript spend draft");
  const k = loadManagedKaspaWasmSync();
  const unsigned = draftTx(k, draft, "", draft.networkId);
  if (String(unsigned.id) !== draft.unsignedTxId) throw spendError("SILVER_SPEND_DRAFT_INVALID", "the draft does not rebuild to the transaction it describes");
  const inputSignature = String(k.createInputSignature(unsigned, 0, new k.PrivateKey(privateKey), k.SighashType.All));
  return Buffer.from(silverSigFromInputSignature(inputSignature)).toString("hex");
}

/**
 * The signed spend: each signer slot takes that signer's signature, the entry
 * arguments are encoded, and the unlock must have the size the fee was checked for.
 */
export function finalizeSilverSpend(
  draft: SilverSpendDraft,
  artifact: SilAbiArtifact,
  args: readonly SilverDraftArg[],
  signatures: Readonly<Record<string, string>>
): { readonly rpcTransaction: any; readonly txId: string; readonly signatureScriptHex: string } {
  if (draft?.schema !== SILVER_SPEND_DRAFT_SCHEMA) throw spendError("SILVER_SPEND_DRAFT_INVALID", "not a SilverScript spend draft");
  const k = loadManagedKaspaWasmSync();
  const lock = silverP2shLock(silContractBytecodeHex(getSilContract(artifact, draft.contractName).contract));
  if (lock.script !== draft.input.scriptPublicKey.script) throw spendError("SILVER_SPEND_LOCK_MISMATCH", "the artifact is not the contract the draft spends");
  const unlock = draftUnlock(artifact, draft.contractName, draft.entry, args, (slot) => {
    const sig = signatures[slot.signer];
    if (!sig) throw spendError("SILVER_SPEND_SIGNATURE_MISSING", `no signature from '${slot.signer}'`);
    return { kind: "bytes", value: Buffer.from(sig, "hex") };
  });
  if (unlock.length !== draft.unlockHexLength) {
    throw spendError("SILVER_SPEND_UNLOCK_SIZE_CHANGED", "the signed unlock is not the size the fee was checked for");
  }
  const tx = draftTx(k, draft, unlock, draft.networkId);
  if (String(tx.id) !== draft.unsignedTxId) throw spendError("SILVER_SPEND_DRAFT_INVALID", "the finalized transaction differs from the draft");
  return { rpcTransaction: parseWasmTxToRpc(tx.serializeToObject()), txId: String(tx.id), signatureScriptHex: unlock };
}
