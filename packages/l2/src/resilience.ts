import { EvmJsonRpcClient, EvmRpcTimeoutError } from "./evm-rpc-client.js";
import {
  normalizeEvmTransactionReceipt,
  type EvmTransactionReceiptSummary
} from "./evm-receipts.js";

export interface RetryPolicyOptions {
  readonly maxRetries?: number | undefined;
  readonly initialDelayMs?: number | undefined;
  readonly maxDelayMs?: number | undefined;
  readonly backoffFactor?: number | undefined;
  readonly isRetryable?: ((error: unknown) => boolean) | undefined;
}

export function isTransientError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);

  // Connection/network issues
  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("request timed out")
  ) {
    return true;
  }

  // Transient HTTP 5xx or rate limits (429)
  if (/HTTP error (502|503|504|429)/.test(msg)) {
    return true;
  }

  return false;
}

/**
 * Retries an idempotent operation (reads, or re-broadcasting the SAME signed raw transaction).
 * Never wrap prepare+sign+send in it: a retry would sign a second transaction with a new nonce.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryPolicyOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const backoffFactor = options.backoffFactor ?? 2;
  const shouldRetry = options.isRetryable ?? isTransientError;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries || !shouldRetry(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }
}

export interface WaitForConfirmationsOptions {
  readonly requiredConfirmations?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly intervalMs?: number | undefined;
}

/**
 * Confirmations counted from ONE RPC provider's view (receipt block vs its head).
 * This is an L2 observation, not cryptographic finality and not L1 settlement.
 */
export interface ConfirmedTransactionResult {
  readonly receipt: EvmTransactionReceiptSummary;
  readonly confirmations: bigint;
  readonly currentBlock: bigint;
  readonly observation: "rpc_reported";
  readonly l1SettlementStatus: "unverified_on_l1";
}

export async function waitForConfirmations(
  client: EvmJsonRpcClient,
  txHash: string,
  options: WaitForConfirmationsOptions = {}
): Promise<ConfirmedTransactionResult> {
  const requiredNum = options.requiredConfirmations ?? 1;
  if (!Number.isSafeInteger(requiredNum) || requiredNum < 1) {
    throw new Error(`requiredConfirmations must be a positive integer (got ${requiredNum}).`);
  }
  const required = BigInt(requiredNum);
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 100;
  const start = Date.now();

  let receiptSummary: EvmTransactionReceiptSummary | null = null;

  while (Date.now() - start < timeoutMs) {
    const rawReceipt = await client.getTransactionReceipt(txHash);
    if (rawReceipt !== null) {
      receiptSummary = normalizeEvmTransactionReceipt(rawReceipt);
      if (receiptSummary?.blockNumber !== undefined) {
        const currentBlock = await client.getBlockNumber();
        // A head below the receipt block (lagging/inconsistent node) counts as 0, never negative.
        const confirmations =
          currentBlock >= receiptSummary.blockNumber
            ? currentBlock - receiptSummary.blockNumber + 1n
            : 0n;
        if (confirmations >= required) {
          return {
            receipt: receiptSummary,
            confirmations,
            currentBlock,
            observation: "rpc_reported",
            l1SettlementStatus: "unverified_on_l1"
          };
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new EvmRpcTimeoutError(
    timeoutMs,
    new Error(
      `Transaction ${txHash} did not reach ${required} confirmation(s) within ${timeoutMs}ms`
    )
  );
}

/**
 * What one RPC node reports about a transaction previously seen in `expectedBlockHash`.
 * - canonical_on_node: same block hash as before.
 * - not_found_on_node: no receipt. Undetermined: pending, pruned, a lagging/different node, or a
 *   reorg. NOT reported as a reorg.
 * - reincluded_in_other_block: receipt now points to another block (possible reorg + re-inclusion).
 * - reorg_observed_on_node: the original block height now has a different hash on this node and
 *   the receipt is gone or moved. Still single-node evidence, not a proof.
 * - receipt_missing_block_hash: malformed/incomplete receipt.
 */
export type L2CanonicalityStatus =
  | "canonical_on_node"
  | "not_found_on_node"
  | "reincluded_in_other_block"
  | "reorg_observed_on_node"
  | "receipt_missing_block_hash";

export interface CanonicalityCheckResult {
  readonly isCanonical: boolean;
  readonly status: L2CanonicalityStatus;
  readonly currentReceipt: EvmTransactionReceiptSummary | null;
  readonly observation: "rpc_reported";
  readonly reason?: string | undefined;
}

export async function verifyTransactionCanonical(
  client: EvmJsonRpcClient,
  txHash: string,
  expectedBlockHash: string,
  expectedBlockNumber?: bigint | undefined
): Promise<CanonicalityCheckResult> {
  const rawReceipt = await client.getTransactionReceipt(txHash);
  const summary = normalizeEvmTransactionReceipt(rawReceipt);

  const blockHashChangedAtHeight = async (): Promise<boolean> => {
    if (expectedBlockNumber === undefined) return false;
    const hashNow = await client.getBlockHashByNumber(expectedBlockNumber);
    return hashNow !== null && hashNow.toLowerCase() !== expectedBlockHash.toLowerCase();
  };

  if (!summary) {
    if (await blockHashChangedAtHeight()) {
      return {
        isCanonical: false,
        status: "reorg_observed_on_node",
        currentReceipt: null,
        observation: "rpc_reported",
        reason: `Block ${expectedBlockNumber} now has a different hash on this node and the receipt is gone.`
      };
    }
    return {
      isCanonical: false,
      status: "not_found_on_node",
      currentReceipt: null,
      observation: "rpc_reported",
      reason:
        "This node returned no receipt. The transaction may be pending, pruned, unknown to this node, or reorged; this alone does not prove a reorg."
    };
  }

  if (!summary.blockHash) {
    return {
      isCanonical: false,
      status: "receipt_missing_block_hash",
      currentReceipt: summary,
      observation: "rpc_reported",
      reason: "Transaction receipt missing blockHash."
    };
  }

  if (summary.blockHash.toLowerCase() !== expectedBlockHash.toLowerCase()) {
    const reorged = await blockHashChangedAtHeight();
    return {
      isCanonical: false,
      status: reorged ? "reorg_observed_on_node" : "reincluded_in_other_block",
      currentReceipt: summary,
      observation: "rpc_reported",
      reason: `Transaction is now reported in block ${summary.blockHash} instead of ${expectedBlockHash} (possible reorg and re-inclusion).`
    };
  }

  return {
    isCanonical: true,
    status: "canonical_on_node",
    currentReceipt: summary,
    observation: "rpc_reported"
  };
}
