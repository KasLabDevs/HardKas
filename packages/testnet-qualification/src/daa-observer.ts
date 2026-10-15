/**
 * TQ-1 UTXO-level acceptance signal for live-network operations.
 *
 * TN10-CONFIRMATION-FIX-1: this module only answers "has the tx left the mempool and do its outputs show in a watched
 * UTXO set?". It never names a block and never confirms: a kaspad UTXO row carries the accepting chain block's DAA
 * score and no block hash, and UTXO presence is not acceptance-block evidence. The accepting block and its blue-score
 * depth come from the virtual chain (`chain-acceptance.ts`). The former `observeInclusion` (a block hash read from a
 * UTXO row) and `assertConfirmedByDaaDelta` (a DAA delta counted as confirmations) are gone.
 *
 * This module deliberately keeps its RPC surface small and injectable so
 * unit tests can drive it with a mock and Block 4 scenarios can bind it to
 * the real HardKAS RPC.
 */

export interface AcceptanceEvidence {
  readonly txid: string;
  readonly acceptedAt: string;
  /** How acceptance was detected. */
  readonly detectedVia:
    | "mempool-gone+utxo-present"
    | "utxo-present-first-observation"
    | "server-confirmation";
  /** Address on which acceptance was witnessed (recipient address). */
  readonly witnessAddress: string;
}

export interface DaaObserverUtxoRow {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly amountSompi: bigint | string | number;
  /** The DAA score of the chain block that accepted the tx (kaspad serves no block hash in a UTXO row). */
  readonly blockDaaScore?: bigint | string | number;
}

export interface DaaObserverRpc {
  /** Returns the entry if the tx is still in mempool; null if not present. */
  getMempoolEntry(txid: string): Promise<{ txid: string } | null>;
  /** Returns UTXOs at the address. Empty array is a valid answer. */
  getUtxosByAddress(address: string): Promise<readonly DaaObserverUtxoRow[]>;
}

export interface WaitForAcceptanceInput {
  readonly txid: string;
  /** Address(es) whose UTXO set should show the tx outputs. */
  readonly watchAddresses: readonly string[];
}

export interface WaitForAcceptanceOptions {
  readonly pollIntervalMs?: number;
  readonly maxWaitMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

/**
 * Poll until acceptance is observable.
 *
 * Definition of "accepted" here (deliberately conservative):
 *  - The tx no longer appears in `getMempoolEntry`, AND
 *  - At least one output shows up in `getUtxosByAddress` for a watched
 *    address whose entry references THIS txid.
 * OR
 *  - On the first observation the tx is already absent from mempool AND
 *    an output is already visible for a watched address.
 *
 * We never treat "gone from mempool" alone as acceptance — it can also mean
 * eviction. This module never silently classifies a lost tx as accepted.
 */
export async function waitForAcceptance(
  rpc: DaaObserverRpc,
  input: WaitForAcceptanceInput,
  options: WaitForAcceptanceOptions = {}
): Promise<AcceptanceEvidence> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => new Date());

  const deadline = now().getTime() + maxWaitMs;
  let sawInMempool = false;

  while (true) {
    const mempool = await rpc.getMempoolEntry(input.txid);
    if (mempool !== null) {
      sawInMempool = true;
    }

    for (const address of input.watchAddresses) {
      const utxos = await rpc.getUtxosByAddress(address);
      const hit = utxos.some((u) => u.outpoint.transactionId === input.txid);
      if (hit && mempool === null) {
        return {
          txid: input.txid,
          acceptedAt: now().toISOString(),
          detectedVia: sawInMempool ? "mempool-gone+utxo-present" : "utxo-present-first-observation",
          witnessAddress: address
        };
      }
    }

    if (now().getTime() >= deadline) {
      throw new Error(
        `TQ_ACCEPTANCE_TIMEOUT: tx ${input.txid} not observed as accepted on any of [${input.watchAddresses.join(", ")}] within ${maxWaitMs}ms (sawInMempool=${sawInMempool})`
      );
    }
    await sleep(pollIntervalMs);
  }
}
