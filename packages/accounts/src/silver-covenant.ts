import {
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shLock,
  silverUnlockScript,
  type SilAbiArtifact,
  type SilArtifactValue
} from "@hardkas/core";
import { calculateUpstreamStorageMass, measureBuiltTransactionMass } from "@hardkas/tx-builder";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";
import type { SilverContractUtxo } from "./silver-spend.js";

/**
 * Toccata covenant transactions for SilverScript contracts (transaction v1).
 *
 * Covenant bindings exist only in v1 transactions, whose inputs commit a
 * compute budget instead of a sig-op count. The covenant id of a genesis is
 * computed by the SDK (`populateGenesisCovenants`), storage mass and fee by the
 * SDK's mass calculator, the successor state by silverc (see
 * @hardkas/core compileSilverSuccessor). Compute budgets are the caller's:
 * the SDK has no estimator, so HardKAS takes them explicitly and the node
 * decides whether they suffice.
 */

function covenantError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const ZERO_SUBNET = "0000000000000000000000000000000000000000";

function checkBudget(budget: number, where: string): number {
  if (!Number.isInteger(budget) || budget < 0 || budget > 0xffff) {
    throw covenantError("COVENANT_COMPUTE_BUDGET_INVALID", `${where}: compute budget ${budget} is not a u16`);
  }
  return budget;
}

/**
 * The SDK's mass calculator (wallet-core) prices an input's compute commitment
 * from its sig-op count only — v1 compute budgets are an upstream TODO
 * (wallet/core/src/tx/mass.rs) — so it cannot price a v1 input that commits a
 * budget. Such transactions take an explicit fee, which the node validates;
 * HardKAS does not add a formula of its own.
 */
function requireExplicitFeeForBudgets(budgets: readonly number[], feeSompi: bigint | undefined): void {
  if (budgets.some((b) => b > 0) && feeSompi === undefined) {
    throw covenantError(
      "COVENANT_V1_FEE_UNPRICED",
      "the SDK mass calculator does not count v1 compute budgets (upstream TODO); pass feeSompi explicitly for inputs with computeBudget > 0"
    );
  }
}

/**
 * Raises the fee until it covers the SDK's minimum for the transaction it
 * leaves behind; an explicit fee is used as given if it is at least that minimum.
 */
function settleFee(build: (fee: bigint) => any, networkId: string, feeRate?: bigint, explicitFee?: bigint) {
  if (explicitFee !== undefined) {
    const measured = measureBuiltTransactionMass(build(explicitFee), networkId);
    if (!measured.standard) {
      throw covenantError("TX_MASS_ABOVE_STANDARD_LIMIT", `mass ${measured.mass} exceeds the maximum standard mass ${measured.maximumStandardMass}`);
    }
    if (explicitFee < measured.minimumFeeSompi) {
      throw covenantError("FEE_BELOW_NETWORK_MINIMUM", `fee ${explicitFee} is below the SDK minimum ${measured.minimumFeeSompi}`);
    }
    return { fee: explicitFee, measured };
  }
  let fee = 0n;
  for (let round = 0; round < 8; round++) {
    const measured = measureBuiltTransactionMass(build(fee), networkId);
    if (!measured.standard) {
      throw covenantError("TX_MASS_ABOVE_STANDARD_LIMIT", `mass ${measured.mass} exceeds the maximum standard mass ${measured.maximumStandardMass}`);
    }
    const byRate = feeRate !== undefined ? measured.mass * feeRate : 0n;
    const required = measured.minimumFeeSompi > byRate ? measured.minimumFeeSompi : byRate;
    if (required <= fee) return { fee, measured };
    fee = required;
  }
  throw covenantError("COVENANT_FEE_UNRESOLVED", "the fee did not converge");
}

// ---------------------------------------------------------------------------
// Genesis
// ---------------------------------------------------------------------------

/** A P2PK (Schnorr) output funding a covenant genesis. */
export interface CovenantFundingInput extends SilverContractUtxo {
  readonly privateKey: string;
  /** Compute budget committed by this input. Explicit: there is no estimator. */
  readonly computeBudget: number;
}

export interface CovenantGenesisRequest {
  readonly artifact: SilAbiArtifact;
  readonly contractName?: string | undefined;
  /** Value locked in the covenant output (output 0). */
  readonly valueSompi: bigint;
  readonly funding: readonly CovenantFundingInput[];
  readonly changeAddress: string;
  readonly networkId: string;
  readonly feeRateSompiPerGram?: bigint | undefined;
  /** Required when an input commits a compute budget > 0 (see COVENANT_V1_FEE_UNPRICED). */
  readonly feeSompi?: bigint | undefined;
}

export interface CovenantTransactionResult {
  readonly transaction: any;
  readonly rpcTransaction: any;
  readonly txId: string;
  readonly covenantId: string;
  readonly lockingScript: { readonly version: number; readonly script: string };
  readonly feeSompi: bigint;
  readonly mass: bigint;
  readonly storageMass: bigint;
  readonly computeBudgets: readonly number[];
  readonly assumptions: readonly string[];
}

/**
 * A v1 transaction creating a new covenant: output 0 locks `valueSompi` to the
 * contract's P2SH script and is bound, by the SDK, to the covenant id derived
 * from input 0's outpoint; output 1 returns the change.
 */
export function buildCovenantGenesis(request: CovenantGenesisRequest): CovenantTransactionResult & { readonly changeSompi: bigint } {
  const k = loadManagedKaspaWasmSync();
  const { contract } = getSilContract(request.artifact, request.contractName);
  const lock = silverP2shLock(silContractBytecodeHex(contract));
  if (request.funding.length === 0) throw covenantError("COVENANT_GENESIS_UNFUNDED", "a genesis needs at least one funding input");
  if (!k.Address.validate(request.changeAddress)) throw covenantError("COVENANT_INVALID_ADDRESS", `'${request.changeAddress}' is not a Kaspa address`);

  const inputs = request.funding.map((f, i) => {
    const key = new k.PrivateKey(f.privateKey);
    const expected = k.payToAddressScript(key.toKeypair().toAddress(request.networkId));
    if (Number(f.scriptPublicKey.version) !== Number(expected.version) || String(f.scriptPublicKey.script).toLowerCase() !== String(expected.script)) {
      throw covenantError("COVENANT_FUNDING_KEY_MISMATCH", `funding input ${i} is not a P2PK output of its key`);
    }
    return { ...f, computeBudget: checkBudget(f.computeBudget, `funding input ${i}`), key };
  });
  const totalIn = inputs.reduce((s, f) => s + f.amountSompi, 0n);

  const make = (fee: bigint, signatureScripts?: readonly string[]) => {
    const change = totalIn - request.valueSompi - fee;
    if (change < 0n) throw covenantError("COVENANT_GENESIS_INSUFFICIENT_FUNDS", `inputs ${totalIn} cannot cover ${request.valueSompi} + fee ${fee}`);
    const outputs: any[] = [{ value: request.valueSompi, scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script) }];
    if (change > 0n) outputs.push({ value: change, scriptPublicKey: k.payToAddressScript(new k.Address(request.changeAddress)) });
    const tx = new k.Transaction({
      version: 1,
      inputs: inputs.map((f, i) => ({
        previousOutpoint: f.outpoint,
        signatureScript: signatureScripts?.[i] ?? "",
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: f.computeBudget,
        utxo: {
          outpoint: f.outpoint,
          amount: f.amountSompi,
          scriptPublicKey: new k.ScriptPublicKey(Number(f.scriptPublicKey.version), String(f.scriptPublicKey.script)),
          blockDaaScore: f.blockDaaScore,
          isCoinbase: f.isCoinbase
        }
      })),
      outputs,
      lockTime: 0n,
      subnetworkId: ZERO_SUBNET,
      gas: 0n,
      payload: ""
    });
    // Before signing: the sighash commits to output bindings and the storage mass.
    tx.populateGenesisCovenants([{ authorizingInput: 0, outputs: [0] }]);
    tx.storageMass = calculateUpstreamStorageMass(
      inputs.map((f) => f.amountSompi),
      change > 0n ? [request.valueSompi, change] : [request.valueSompi],
      request.networkId
    );
    return tx;
  };

  // Unsigned P2PK inputs: the SDK prices each with one expected signature.
  requireExplicitFeeForBudgets(inputs.map((f) => f.computeBudget), request.feeSompi);
  const { fee, measured } = settleFee((f) => make(f), request.networkId, request.feeRateSompiPerGram, request.feeSompi);
  const unsigned = make(fee);
  const signatures = inputs.map((f, i) => String(k.createInputSignature(unsigned, i, f.key, k.SighashType.All)));
  const signed = make(fee, signatures);
  const binding = signed.outputs[0].covenant;
  if (!binding) throw covenantError("COVENANT_GENESIS_UNBOUND", "the SDK did not bind the covenant output");

  return {
    transaction: signed,
    rpcTransaction: parseWasmTxToRpc(signed.serializeToObject()),
    txId: String(signed.id),
    covenantId: String(binding.covenantId),
    lockingScript: lock,
    feeSompi: fee,
    mass: measured.mass,
    storageMass: BigInt(signed.storageMass),
    changeSompi: totalIn - request.valueSompi - fee,
    computeBudgets: inputs.map((f) => f.computeBudget),
    assumptions: [
      ...measured.assumptions,
      "compute budgets supplied by the caller; validated only by the node",
      ...(request.feeSompi !== undefined ? ["fee supplied by the caller: the SDK does not price v1 compute budgets"] : [])
    ]
  };
}

// ---------------------------------------------------------------------------
// Singleton transition
// ---------------------------------------------------------------------------

export interface CovenantUtxo extends SilverContractUtxo {
  /** The covenant id the node reports for this UTXO. */
  readonly covenantId: string;
}

export interface CovenantTransitionRequest {
  /** Artifact of the state the covenant output holds now. */
  readonly current: SilAbiArtifact;
  /** Artifact of the successor state (compileSilverSuccessor). */
  readonly successor: SilAbiArtifact;
  readonly contractName?: string | undefined;
  /** The covenant declaration's policy name (its key in cov_decl_to_abi). */
  readonly policy: string;
  /** Arguments of the generated entry (the policy's extra call args). */
  readonly args: readonly SilArtifactValue[];
  readonly utxo: CovenantUtxo;
  readonly networkId: string;
  /** Compute budget committed by the covenant input. Explicit: there is no estimator. */
  readonly computeBudget: number;
  readonly feeRateSompiPerGram?: bigint | undefined;
  /** Required when computeBudget > 0 (see COVENANT_V1_FEE_UNPRICED). */
  readonly feeSompi?: bigint | undefined;
}

/**
 * A v1 transaction advancing a singleton covenant by one transition: the
 * covenant output is spent through the compiler-generated entry and its whole
 * value, minus the fee, moves to one successor output locked to the successor
 * state and bound to the same covenant id.
 *
 * Only single-successor, auth-bound declarations are built. The ABI does not
 * record a declaration's binding or cardinality, so the node enforces them;
 * leader contracts (cov binding, with a delegate entry) are NOT_IMPLEMENTED.
 */
export function buildCovenantTransition(request: CovenantTransitionRequest): CovenantTransactionResult & { readonly successorSompi: bigint } {
  const k = loadManagedKaspaWasmSync();
  const { name, contract } = getSilContract(request.current, request.contractName);
  const next = getSilContract(request.successor, name).contract;
  if (contract.delegate_entry_abi !== undefined) {
    throw covenantError("COVENANT_BINDING_NOT_IMPLEMENTED", `contract '${name}' is a cov-bound leader contract; only auth-bound singletons are supported`);
  }
  const entry = contract.cov_decl_to_abi?.[request.policy];
  if (!entry) {
    throw covenantError(
      "COVENANT_POLICY_NOT_FOUND",
      `contract '${name}' declares no covenant policy '${request.policy}' (has: ${Object.keys(contract.cov_decl_to_abi ?? {}).join(", ") || "none"})`
    );
  }
  if (!Buffer.from(contract.compiled.template_hash).equals(Buffer.from(next.compiled.template_hash))) {
    throw covenantError("SILVER_SUCCESSOR_TEMPLATE_CHANGED", "the successor artifact is not the same template");
  }

  const bytecode = silContractBytecodeHex(contract);
  const lock = silverP2shLock(bytecode);
  const successorLock = silverP2shLock(silContractBytecodeHex(next));
  const u = request.utxo;
  if (Number(u.scriptPublicKey.version) !== lock.version || String(u.scriptPublicKey.script).toLowerCase() !== lock.script) {
    throw covenantError("SILVER_SPEND_LOCK_MISMATCH", `output ${u.outpoint.transactionId}:${u.outpoint.index} is not locked to the current state of '${name}'`);
  }
  if (!/^[0-9a-f]{64}$/i.test(u.covenantId ?? "")) throw covenantError("COVENANT_ID_MISSING", "the covenant UTXO carries no covenant id");
  const budget = checkBudget(request.computeBudget, "covenant input");

  const unlock = silverUnlockScript(bytecode, encodeSilverEntryArgs({ artifact: request.current, contractName: name, entry, args: request.args }));
  const make = (fee: bigint) => {
    const value = u.amountSompi - fee;
    if (value <= 0n) throw covenantError("COVENANT_INSUFFICIENT_VALUE", `covenant output of ${u.amountSompi} cannot pay a fee of ${fee}`);
    const tx = new k.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: u.outpoint,
        signatureScript: unlock,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: budget,
        utxo: {
          outpoint: u.outpoint,
          amount: u.amountSompi,
          scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script),
          blockDaaScore: u.blockDaaScore,
          isCoinbase: u.isCoinbase,
          covenantId: u.covenantId
        }
      }],
      outputs: [{
        value,
        scriptPublicKey: new k.ScriptPublicKey(successorLock.version, successorLock.script),
        covenant: { authorizingInput: 0, covenantId: u.covenantId }
      }],
      lockTime: 0n,
      subnetworkId: ZERO_SUBNET,
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass([u.amountSompi], [value], request.networkId);
    return tx;
  };

  requireExplicitFeeForBudgets([budget], request.feeSompi);
  const { fee, measured } = settleFee(make, request.networkId, request.feeRateSompiPerGram, request.feeSompi);
  const tx = make(fee);
  return {
    transaction: tx,
    rpcTransaction: parseWasmTxToRpc(tx.serializeToObject()),
    txId: String(tx.id),
    covenantId: u.covenantId,
    lockingScript: successorLock,
    feeSompi: fee,
    mass: measured.mass,
    storageMass: BigInt(tx.storageMass),
    successorSompi: u.amountSompi - fee,
    computeBudgets: [budget],
    assumptions: [
      ...measured.assumptions,
      "compute budget supplied by the caller; validated only by the node",
      ...(request.feeSompi !== undefined ? ["fee supplied by the caller: the SDK does not price v1 compute budgets"] : [])
    ]
  };
}
