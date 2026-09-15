/**
 * TQ-1 DAA-based observer for live-network operations.
 *
 * Kaspa's confirmation model is DAG-based; we do NOT use "N blocks" as the
 * primary concept. The receipt records:
 *   inclusionBlockHash + inclusionDaaScore + virtualDaaScoreAtObservation
 *   + deltaDaa + configuredDaaDelta + criterion.
 *
 * Default `configuredDaaDelta = 10` is a lightweight OPERATIONAL threshold,
 * not economic irreversibility. It exists so TQ-1 verifies that inclusion is
 * stable enough to build a follow-up spend-change tx on top of.
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

export interface InclusionEvidence {
  readonly txid: string;
  readonly inclusionBlockHash: string;
  readonly inclusionDaaScore: bigint;
  readonly observedAt: string;
}

export interface ConfirmationEvidence extends InclusionEvidence {
  readonly virtualDaaScoreAtObservation: bigint;
  readonly deltaDaa: bigint;
  readonly configuredDaaDelta: bigint;
  readonly criterion: string;
}

export interface DaaObserverUtxoRow {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly amountSompi: bigint | string | number;
  readonly blockDaaScore?: bigint | string | number;
  readonly blockHash?: string;
}

export interface DaaObserverRpc {
  getBlockDagInfo(): Promise<{ virtualDaaScore: bigint | string | number }>;
  /** Returns the entry if the tx is still in mempool; null if not present. */
  getMempoolEntry(txid: string): Promise<{ txid: string } | null>;
  /** Returns UTXOs at the address. Empty array is a valid answer. */
  getUtxosByAddress(address: string): Promise<readonly DaaObserverUtxoRow[]>;
}

function coerceBigint(v: bigint | string | number | undefined): bigint | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v)) return undefined;
    return BigInt(v);
  }
  if (typeof v === "string") {
    try {
      return BigInt(v);
    } catch {
      return undefined;
    }
  }
  return undefined;
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

export interface ObserveInclusionInput {
  readonly txid: string;
  /** Address on which the tx output is expected to appear. */
  readonly witnessAddress: string;
}

/**
 * Observe inclusion of a tx by looking up the UTXO row on the witness
 * address. Requires the UTXO to carry `blockDaaScore` and `blockHash` (both
 * present in current Kaspa RPC responses). If either is missing, throws
 * `TQ_INCLUSION_METADATA_MISSING` — the scenario should stop and the receipt
 * must record that gap; TQ does not fabricate inclusion evidence.
 */
export async function observeInclusion(
  rpc: DaaObserverRpc,
  input: ObserveInclusionInput,
  options: { now?: () => Date } = {}
): Promise<InclusionEvidence> {
  const now = options.now ?? (() => new Date());
  const utxos = await rpc.getUtxosByAddress(input.witnessAddress);
  const row = utxos.find((u) => u.outpoint.transactionId === input.txid);
  if (!row) {
    throw new Error(
      `TQ_INCLUSION_UTXO_NOT_FOUND: no UTXO row for tx ${input.txid} at ${input.witnessAddress}`
    );
  }
  const inclusionDaaScore = coerceBigint(row.blockDaaScore);
  if (inclusionDaaScore === undefined || !row.blockHash) {
    throw new Error(
      `TQ_INCLUSION_METADATA_MISSING: UTXO row for tx ${input.txid} lacks blockHash or blockDaaScore`
    );
  }
  return {
    txid: input.txid,
    inclusionBlockHash: row.blockHash,
    inclusionDaaScore,
    observedAt: now().toISOString()
  };
}

export interface AssertConfirmedByDaaDeltaOptions {
  readonly configuredDaaDelta: bigint;
  readonly pollIntervalMs?: number;
  readonly maxWaitMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

const CRITERION = "virtualDaaScore - inclusionDaaScore >= configuredDaaDelta";

/**
 * Poll `virtualDaaScore` until the delta against `inclusionDaaScore` meets
 * the configured threshold. Emits full confirmation evidence.
 */
export async function assertConfirmedByDaaDelta(
  rpc: DaaObserverRpc,
  inclusion: InclusionEvidence,
  options: AssertConfirmedByDaaDeltaOptions
): Promise<ConfirmationEvidence> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => new Date());

  const deadline = now().getTime() + maxWaitMs;

  while (true) {
    const dagInfo = await rpc.getBlockDagInfo();
    const virt = coerceBigint(dagInfo.virtualDaaScore);
    if (virt === undefined) {
      throw new Error(
        `TQ_VIRTUAL_DAA_INVALID: getBlockDagInfo returned unusable virtualDaaScore=${String(dagInfo.virtualDaaScore)}`
      );
    }
    const delta = virt - inclusion.inclusionDaaScore;
    if (delta >= options.configuredDaaDelta) {
      return {
        txid: inclusion.txid,
        inclusionBlockHash: inclusion.inclusionBlockHash,
        inclusionDaaScore: inclusion.inclusionDaaScore,
        virtualDaaScoreAtObservation: virt,
        deltaDaa: delta,
        configuredDaaDelta: options.configuredDaaDelta,
        criterion: CRITERION,
        observedAt: now().toISOString()
      };
    }

    if (now().getTime() >= deadline) {
      throw new Error(
        `TQ_CONFIRMATION_TIMEOUT: delta ${delta.toString()} < configuredDaaDelta ${options.configuredDaaDelta.toString()} for tx ${inclusion.txid} within ${maxWaitMs}ms`
      );
    }
    await sleep(pollIntervalMs);
  }
}
