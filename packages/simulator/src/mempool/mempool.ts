import { transactionId as computeTransactionId } from "../crypto/tx-hashing.js";
import { validateTransactionScripts } from "../ledger/script-engine.js";
import { UtxoLedger } from "../ledger/utxo-ledger.js";
import { measureTransactionMass, minimumRelayFee, nonContextualMasses, DEFAULT_MINIMUM_RELAY_FEERATE, MAXIMUM_BLOCK_MASS } from "../mass.js";
import type { KaspaRpcTransaction, MempoolTransaction, SimulatorUtxo } from "../types.js";

/**
 * Minimum relay feerate in sompi per gram (rusty-kaspa 2.1.0 mining/src/mempool/config.rs
 * `DEFAULT_MINIMUM_RELAY_TRANSACTION_FEE` = 100 000 sompi per kg). It was 1 here before (SIM-08).
 */
export const DEFAULT_MIN_FEE_RATE = DEFAULT_MINIMUM_RELAY_FEERATE;
export const DEFAULT_MAX_BLOCK_MASS = MAXIMUM_BLOCK_MASS;

/**
 * rusty-kaspa consensus/core/src/constants.rs `UNACCEPTED_DAA_SCORE`: the DAA score the node gives an output of a
 * transaction that is still in the mempool when a child spends it.
 */
export const UNACCEPTED_DAA_SCORE = 2n ** 64n - 1n;

export { computeTransactionId };

/**
 * Compute mass of a transaction (the term the relay fee is charged on), computed with the node's rules through
 * @hardkas/tx-builder (SIM-08: it used to be 200 + 1000·inputs + 350·outputs + payload, constants of its own).
 * `tx.mass`, when set, is the transaction's committed storage mass and is not what this returns.
 */
export function estimateTxMass(tx: KaspaRpcTransaction): bigint {
  return nonContextualMasses(tx).computeMass;
}

type Rejection = { ok: false; error: string; code: string };

/**
 * The simulator's mempool. Approximate (see the package README for the known divergences): it checks inputs (ledger or
 * in-mempool parents), scripts (script-engine), the node's masses and its minimum relay fee; it has no orphan pool and no
 * replace-by-fee.
 */
export class Mempool {
  private transactions = new Map<string, MempoolTransaction>();
  private spentOutpoints = new Map<string, string>(); // outpointKey -> txId

  /** @param minFeeRate minimum relay feerate, sompi per gram of fee mass (default: the node's 100). */
  constructor(private readonly minFeeRate: bigint = DEFAULT_MIN_FEE_RATE) {}

  public getMinimumFeeRate(): bigint {
    return this.minFeeRate;
  }

  /** An output of a transaction still in the mempool, as a child spending it sees it (UNACCEPTED_DAA_SCORE). */
  private mempoolOutput(txId: string, index: number): SimulatorUtxo | undefined {
    const parent = this.transactions.get(txId.toLowerCase());
    const out = parent?.transaction.outputs[index];
    if (!parent || !out) return undefined;
    return {
      transactionId: parent.transactionId,
      index,
      address: (out as any).address ?? "",
      amountSompi: BigInt(out.amount),
      scriptPublicKey: out.scriptPublicKey.scriptPublicKey,
      blockDaaScore: UNACCEPTED_DAA_SCORE,
      isCoinbase: false,
      ...(out.scriptPublicKey.version ? { scriptPublicKeyVersion: Number(out.scriptPublicKey.version) } : {}),
      ...(out.covenant ? { covenant: out.covenant, covenantId: String(out.covenant.covenantId).toLowerCase() } : {})
    };
  }

  /**
   * Submits a transaction to the mempool.
   * Performs full syntactic, semantic, and signature validation.
   */
  public submitTransaction(
    tx: KaspaRpcTransaction,
    ledger: UtxoLedger,
    currentDaaScore: bigint,
    context: { readonly pastMedianTimeMs?: bigint } = {}
  ): { ok: true; transactionId: string; feeSompi: bigint; mass: bigint; storageMass: bigint } | Rejection {
    if (!tx.inputs || tx.inputs.length === 0) {
      return { ok: false, error: "Transaction has no inputs", code: "RejectNoInputs" };
    }
    if (!tx.outputs || tx.outputs.length === 0) {
      return { ok: false, error: "Transaction has no outputs", code: "RejectNoOutputs" };
    }

    // SIM-04: the id is the one computed from the transaction. An id the client carries (`id`, `verboseData`) is ignored,
    // as the node ignores it; the former `RejectInvalidTxId` rule does not exist in rusty-kaspa.
    let txId: string;
    try {
      txId = computeTransactionId(tx);
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e), code: String(e?.code ?? "RejectTransactionIdUnavailable") };
    }

    if (this.transactions.has(txId)) {
      return { ok: false, error: `Transaction ${txId} already exists in mempool`, code: "RejectDuplicate" };
    }

    // 1. Resolve and check all input UTXOs: the confirmed ledger first, then the outputs of mempool transactions
    //    (SIM-09: a chain of unconfirmed transactions is admitted, as by the node).
    const spentUtxos: SimulatorUtxo[] = [];
    const outpointKeys: string[] = [];
    const parents = new Set<string>();
    const seenInTx = new Set<string>();

    for (let i = 0; i < tx.inputs.length; i++) {
      const inp = tx.inputs[i]!;
      const key = UtxoLedger.outpointKey(inp.previousOutpoint.transactionId, inp.previousOutpoint.index);

      // Check duplicate inputs in the same transaction
      if (seenInTx.has(key)) {
        return {
          ok: false,
          error: `Transaction has duplicate input spending outpoint ${key}`,
          code: "RejectDuplicateInput"
        };
      }
      seenInTx.add(key);

      // Check double spend in mempool
      const existingMempoolTx = this.spentOutpoints.get(key);
      if (existingMempoolTx) {
        return {
          ok: false,
          error: `Outpoint ${key} is already spent by unconfirmed mempool transaction ${existingMempoolTx}`,
          code: "RejectMempoolDoubleSpend"
        };
      }

      let utxo = ledger.getUtxo(inp.previousOutpoint.transactionId, inp.previousOutpoint.index);
      if (!utxo) {
        utxo = this.mempoolOutput(inp.previousOutpoint.transactionId, inp.previousOutpoint.index);
        if (utxo) parents.add(utxo.transactionId);
      }
      if (!utxo) {
        // No orphan pool: an input that is neither confirmed nor in the mempool is refused (allowOrphan is ignored).
        return {
          ok: false,
          error: `Missing UTXO: ${key} not found or already spent`,
          code: "RejectMissingUtxo"
        };
      }

      if (!ledger.isSpendable(utxo, currentDaaScore)) {
        return {
          ok: false,
          error: `Coinbase UTXO ${key} is immature (created at DAA score ${utxo.blockDaaScore}, virtual DAA score ${currentDaaScore})`,
          code: "RejectImmatureCoinbase"
        };
      }

      spentUtxos.push(utxo);
      outpointKeys.push(key);
    }

    // 2. Validate scripts & signatures (dust limits, amounts, signatures)
    // the DAG's past median time for time lock times (S1's finality rule); coinbase maturity is checked above by the ledger
    const scriptResult = validateTransactionScripts(
      tx,
      spentUtxos,
      currentDaaScore,
      context.pastMedianTimeMs !== undefined ? { pastMedianTimeMs: context.pastMedianTimeMs } : {}
    );
    if (!scriptResult.valid) {
      return {
        ok: false,
        error: scriptResult.error || "Script validation failed",
        code: "RejectScriptFailed"
      };
    }

    // 3. Masses, with the node's rules (tx-builder): each within its block limit; the relay fee on the fee mass
    //    (max of compute and normalized transient), never on the storage mass (SIM-08).
    let measured;
    try {
      measured = measureTransactionMass(tx, spentUtxos);
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e), code: "RejectMassIncomputable" };
    }
    if (!measured.withinBlockLimits) {
      return {
        ok: false,
        error:
          `Transaction masses (compute ${measured.computeMass}, storage ${measured.storageMass}, transient ${measured.transientMass}) ` +
          `exceed the block mass limits`,
        code: "RejectMassTooHigh"
      };
    }

    // 4. Fee validation: the node's minimum relay fee
    const requiredFee = minimumRelayFee(measured.feeMass, this.minFeeRate);
    if (scriptResult.feeSompi < requiredFee) {
      return {
        ok: false,
        error: `Fee ${scriptResult.feeSompi} sompi is below the minimum relay fee ${requiredFee} sompi (fee mass ${measured.feeMass} at ${this.minFeeRate} sompi/gram)`,
        code: "RejectInsufficientFee"
      };
    }

    // The mass a transaction is prioritized by: the largest of its (normalized) masses, as the node's feerate.
    const mass = measured.priorityMass;
    const feeRate = Number(scriptResult.feeSompi) / Number(mass === 0n ? 1n : mass);

    // SIM-07 point 9 · rusty-kaspa 2.1.0 (utxo_validation.rs `validate_mempool_transaction_in_utxo_context`): the mempool
    // computes the contextual (storage) mass itself, sets it on the transaction (`set_storage_mass`) and validates with
    // TxValidationFlags::SkipMassCheck. Whatever mass the client committed is replaced, never checked; blocks commit this
    // one, and block validation (DagChain.mineBlock, checkMassCommitment) requires committed == calculated (WrongMass).
    const committedTx: KaspaRpcTransaction = { ...tx, mass: measured.storageMass };

    const mempoolTx: MempoolTransaction & { parents?: ReadonlyArray<string> } = {
      transactionId: txId,
      transaction: committedTx,
      mass,
      feeSompi: scriptResult.feeSompi,
      feeRate,
      addedAtDaaScore: currentDaaScore,
      spentOutpoints: outpointKeys,
      ...(parents.size > 0 ? { parents: [...parents] } : {})
    };

    this.transactions.set(txId, mempoolTx);
    for (const key of outpointKeys) {
      this.spentOutpoints.set(key, txId);
    }

    return { ok: true, transactionId: txId, feeSompi: scriptResult.feeSompi, mass, storageMass: measured.storageMass };
  }

  public getTransaction(txId: string): MempoolTransaction | undefined {
    return this.transactions.get(txId.toLowerCase());
  }

  public hasTransaction(txId: string): boolean {
    return this.transactions.has(txId.toLowerCase());
  }

  public getAllTransactions(): MempoolTransaction[] {
    return Array.from(this.transactions.values());
  }

  public isOutpointSpent(outpointKey: string): boolean {
    return this.spentOutpoints.has(outpointKey.toLowerCase());
  }

  public removeTransaction(txId: string): MempoolTransaction | undefined {
    const cleanId = txId.toLowerCase();
    const existing = this.transactions.get(cleanId);
    if (!existing) return undefined;

    this.transactions.delete(cleanId);
    for (const key of existing.spentOutpoints) {
      this.spentOutpoints.delete(key);
    }
    return existing;
  }

  /**
   * Selects highest fee-rate transactions from mempool up to `maxMass`, in dependency order: a transaction is taken
   * only after every in-mempool transaction it spends (SIM-09).
   */
  public selectTransactionsForBlock(maxMass: bigint = DEFAULT_MAX_BLOCK_MASS): MempoolTransaction[] {
    const pending = Array.from(this.transactions.values()).sort((a, b) => b.feeRate - a.feeRate);
    const selected: MempoolTransaction[] = [];
    const taken = new Set<string>();
    let accumulatedMass = 0n;

    let progress = true;
    while (progress) {
      progress = false;
      for (const tx of pending) {
        if (taken.has(tx.transactionId)) continue;
        const parents = (tx as { parents?: ReadonlyArray<string> }).parents ?? [];
        // a parent no longer in the mempool was mined already: its outputs are in the ledger
        if (!parents.every((p) => taken.has(p) || !this.transactions.has(p))) continue;
        if (accumulatedMass + tx.mass > maxMass) continue;
        selected.push(tx);
        taken.add(tx.transactionId);
        accumulatedMass += tx.mass;
        progress = true;
      }
    }
    return selected;
  }

  public clear(): void {
    this.transactions.clear();
    this.spentOutpoints.clear();
  }

  public clone(): Mempool {
    const next = new Mempool(this.minFeeRate);
    for (const tx of this.transactions.values()) {
      next.transactions.set(tx.transactionId, { ...tx });
      for (const k of tx.spentOutpoints) {
        next.spentOutpoints.set(k, tx.transactionId);
      }
    }
    return next;
  }
}
