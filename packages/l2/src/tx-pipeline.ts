import { keccak256, parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  EvmJsonRpcClient,
  EvmJsonRpcError,
  EvmRpcTimeoutError,
  EvmSignerChainMismatchError
} from "./evm-rpc-client.js";
import {
  normalizeEvmTransactionReceipt,
  type EvmTransactionReceiptSummary
} from "./evm-receipts.js";
import { type L2NetworkProfile } from "./profiles.js";
import { EvmNonceManager } from "./nonce-manager.js";
import {
  L2SafetyError,
  L2TxHashMismatchError,
  L2TxPendingError
} from "./errors.js";
import { isAddress, isHash32 } from "./hex.js";
import {
  assertChainIdMatches,
  assertFeeWithinLimits,
  assertL2WriteAllowed,
  resolveFeeLimits,
  type L2FeeLimits
} from "./network-guard.js";
import {
  assertRawTransactionAllowed,
  resolveBinding,
  type L2WriteOptions
} from "./raw-tx-guard.js";

export { EvmSignerChainMismatchError, EvmNonceManager, assertRawTransactionAllowed };
export type { L2WriteOptions };

export type EvmTransactionType = "eip1559" | "legacy";

export interface EvmTransactionRequest {
  readonly to?: string | undefined;
  readonly value?: bigint | string | number | undefined;
  readonly data?: string | undefined;
  readonly nonce?: number | bigint | undefined;
  readonly gasLimit?: bigint | undefined;
  readonly maxFeePerGas?: bigint | undefined;
  readonly maxPriorityFeePerGas?: bigint | undefined;
  readonly gasPrice?: bigint | undefined;
  readonly type?: EvmTransactionType | undefined;
}

export interface EvmPreparedTransaction {
  readonly to?: `0x${string}` | undefined;
  readonly from: `0x${string}`;
  readonly value: bigint;
  readonly data: `0x${string}`;
  readonly nonce: number;
  readonly gasLimit: bigint;
  readonly chainId: number;
  readonly type: EvmTransactionType;
  readonly maxFeePerGas?: bigint | undefined;
  readonly maxPriorityFeePerGas?: bigint | undefined;
  readonly gasPrice?: bigint | undefined;
}

export class EvmTransactionRevertedError extends Error {
  public readonly txHash: string;
  public readonly receipt: EvmTransactionReceiptSummary;

  constructor(txHash: string, receipt: EvmTransactionReceiptSummary) {
    super(`EVM transaction ${txHash} reverted on-chain (status 0x0).`);
    this.name = "EvmTransactionRevertedError";
    this.txHash = txHash;
    this.receipt = receipt;
  }
}

function toNonNegativeBigInt(value: bigint | string | number, field: string): bigint {
  let v: bigint;
  if (typeof value === "bigint") v = value;
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new L2SafetyError("L2_INVALID_TX_PARAMS", `${field} must be an integer (got ${value}).`);
    }
    v = BigInt(value);
  } else if (/^[0-9]+$/.test(value) || /^0x[0-9a-fA-F]+$/.test(value)) {
    v = BigInt(value);
  } else {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `${field} is not an integer: ${JSON.stringify(value)}.`);
  }
  if (v < 0n) throw new L2SafetyError("L2_INVALID_TX_PARAMS", `${field} must be >= 0 (got ${v}).`);
  return v;
}

function toNonce(value: number | bigint, field = "nonce"): number {
  const v = toNonNegativeBigInt(value, field);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `${field} ${v} exceeds the safe integer range.`);
  }
  return Number(v);
}

function feeCheckInput(tx: {
  gasLimit: bigint;
  type: EvmTransactionType;
  gasPrice?: bigint | undefined;
  maxFeePerGas?: bigint | undefined;
  maxPriorityFeePerGas?: bigint | undefined;
}) {
  return tx.type === "eip1559"
    ? {
        gasLimit: tx.gasLimit,
        feePerGasWei: tx.maxFeePerGas ?? 0n,
        maxPriorityFeePerGasWei: tx.maxPriorityFeePerGas
      }
    : { gasLimit: tx.gasLimit, feePerGasWei: tx.gasPrice ?? 0n };
}

export interface EvmSigner {
  getAddress(): `0x${string}`;
  signTransaction(
    tx: EvmPreparedTransaction
  ): Promise<{ rawTransaction: `0x${string}`; txHash: `0x${string}` }>;
}

export interface EvmLocalAccountSignerOptions extends L2WriteOptions {}

/**
 * Local private-key signer. Bound to one chain at construction; refuses any other chain,
 * refuses mainnet without `allowMainnet: true`, and enforces fee ceilings.
 */
export class EvmLocalAccountSigner implements EvmSigner {
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  public readonly expectedChainId: number;
  private readonly profile?: L2NetworkProfile | undefined;
  private readonly allowMainnet: boolean;
  private readonly feeLimits: L2FeeLimits;

  constructor(privateKey: string, options: EvmLocalAccountSignerOptions = {}) {
    let normalized = privateKey.trim();
    if (!normalized.startsWith("0x")) {
      normalized = `0x${normalized}`;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
      throw new Error("Invalid EVM private key: must be a 64-character hex string.");
    }
    this.account = privateKeyToAccount(normalized as `0x${string}`);

    const binding = resolveBinding(options);
    this.expectedChainId = binding.expectedChainId;
    this.profile = binding.profile;
    this.allowMainnet = options.allowMainnet === true;
    this.feeLimits = resolveFeeLimits(options.feeLimits, this.profile?.feePolicy);
  }

  getAddress(): `0x${string}` {
    return this.account.address;
  }

  async signTransaction(
    tx: EvmPreparedTransaction
  ): Promise<{ rawTransaction: `0x${string}`; txHash: `0x${string}` }> {
    assertChainIdMatches(this.expectedChainId, tx.chainId);
    assertL2WriteAllowed({
      chainId: tx.chainId,
      profile: this.profile,
      allowMainnet: this.allowMainnet,
      operation: "signTransaction"
    });

    if (tx.from.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error(
        `Signer address ${this.account.address} does not match prepared transaction from ${tx.from}`
      );
    }
    if (tx.to !== undefined && !isAddress(tx.to)) {
      throw new L2SafetyError("L2_INVALID_TX_PARAMS", `Invalid 'to' address: ${String(tx.to)}`);
    }
    toNonNegativeBigInt(tx.value, "value");
    toNonce(tx.nonce);
    if (tx.type === "eip1559" && tx.gasPrice !== undefined) {
      throw new L2SafetyError("L2_INVALID_TX_PARAMS", "EIP-1559 transaction must not carry gasPrice.");
    }
    if (
      tx.type === "legacy" &&
      (tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined)
    ) {
      throw new L2SafetyError("L2_INVALID_TX_PARAMS", "Legacy transaction must not carry EIP-1559 fees.");
    }
    assertFeeWithinLimits(feeCheckInput(tx), this.feeLimits);

    const txBase = {
      ...(tx.to ? { to: tx.to } : {}),
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce,
      gas: tx.gasLimit,
      chainId: tx.chainId
    };

    let serialized: `0x${string}`;
    if (tx.type === "eip1559") {
      serialized = await this.account.signTransaction({
        ...txBase,
        type: "eip1559",
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      });
    } else {
      serialized = await this.account.signTransaction({
        ...txBase,
        type: "legacy",
        gasPrice: tx.gasPrice
      });
    }

    // Defense in depth: the serialized transaction must carry the bound chain ID.
    const decoded = parseTransaction(serialized);
    if (decoded.chainId !== this.expectedChainId) {
      throw new L2SafetyError(
        "L2_SIGNED_TX_MISMATCH",
        `Serialized transaction chain ID ${String(decoded.chainId)} differs from bound chain ${this.expectedChainId}.`
      );
    }

    return {
      rawTransaction: serialized,
      txHash: keccak256(serialized)
    };
  }
}

export interface PrepareEvmTransactionOptions extends L2WriteOptions {
  readonly gasBufferPercentage?: number | undefined;
  readonly preferredType?: EvmTransactionType | undefined;
  readonly minGasPriceWei?: bigint | undefined;
  readonly nonceManager?: EvmNonceManager | undefined;
}

/**
 * Prepares a transaction for signing. Refuses unless:
 * - a chain ID is bound and the RPC reports exactly that chain,
 * - the write guard passes (mainnet needs allowMainnet),
 * - every fee value (user-supplied or RPC-estimated) is within the ceilings.
 */
export async function prepareEvmTransaction(
  client: EvmJsonRpcClient,
  from: string,
  request: EvmTransactionRequest,
  options: PrepareEvmTransactionOptions = {}
): Promise<EvmPreparedTransaction> {
  if (!isAddress(from)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `Invalid 'from' address: ${String(from)}`);
  }
  if (request.to !== undefined && !isAddress(request.to)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `Invalid 'to' address: ${String(request.to)}`);
  }
  const normalizedFrom = from.toLowerCase() as `0x${string}`;
  const normalizedTo = request.to
    ? (request.to.toLowerCase() as `0x${string}`)
    : undefined;

  const { expectedChainId, profile } = resolveBinding(options, client);
  assertL2WriteAllowed({
    chainId: expectedChainId,
    profile,
    allowMainnet: options.allowMainnet,
    operation: "prepareEvmTransaction"
  });
  const limits = resolveFeeLimits(options.feeLimits, profile?.feePolicy);

  const rpcChainId = await client.getChainId();
  assertChainIdMatches(expectedChainId, rpcChainId);

  const txType = request.type ?? options.preferredType ?? profile?.preferredTxType ?? "eip1559";
  if (
    request.gasPrice !== undefined &&
    (request.maxFeePerGas !== undefined || request.maxPriorityFeePerGas !== undefined)
  ) {
    throw new L2SafetyError(
      "L2_INVALID_TX_PARAMS",
      "gasPrice cannot be combined with maxFeePerGas/maxPriorityFeePerGas."
    );
  }
  if (txType === "legacy" && (request.maxFeePerGas !== undefined || request.maxPriorityFeePerGas !== undefined)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", "Legacy transactions take gasPrice, not EIP-1559 fees.");
  }
  if (txType === "eip1559" && request.gasPrice !== undefined) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", "EIP-1559 transactions take maxFeePerGas, not gasPrice.");
  }
  for (const [k, v] of [
    ["gasLimit", request.gasLimit],
    ["gasPrice", request.gasPrice],
    ["maxFeePerGas", request.maxFeePerGas],
    ["maxPriorityFeePerGas", request.maxPriorityFeePerGas]
  ] as const) {
    if (v !== undefined) toNonNegativeBigInt(v, k);
  }

  // 1. Resolve nonce
  let nonce: number;
  if (request.nonce !== undefined) {
    nonce = toNonce(request.nonce);
  } else if (options.nonceManager) {
    nonce = await options.nonceManager.acquireNonce(client, normalizedFrom);
  } else {
    nonce = toNonce(await client.getTransactionCount(normalizedFrom, "pending"), "pending nonce");
  }

  const managedNonce = options.nonceManager !== undefined && request.nonce === undefined;
  try {
    return await finishPrepare(client, request, options, {
      normalizedFrom,
      normalizedTo,
      expectedChainId,
      txType,
      nonce,
      limits
    });
  } catch (e) {
    // Never leave a gap: a nonce reserved for a transaction that was not signed is returned.
    if (managedNonce) {
      options.nonceManager!.releaseUnusedNonce(normalizedFrom, expectedChainId, nonce);
    }
    throw e;
  }
}

async function finishPrepare(
  client: EvmJsonRpcClient,
  request: EvmTransactionRequest,
  options: PrepareEvmTransactionOptions,
  ctx: {
    normalizedFrom: `0x${string}`;
    normalizedTo: `0x${string}` | undefined;
    expectedChainId: number;
    txType: EvmTransactionType;
    nonce: number;
    limits: L2FeeLimits;
  }
): Promise<EvmPreparedTransaction> {
  const { normalizedFrom, normalizedTo, expectedChainId, txType, nonce, limits } = ctx;
  // 2. Parse Value & Data
  const value = request.value === undefined ? 0n : toNonNegativeBigInt(request.value, "value");
  const data = (request.data ?? "0x") as `0x${string}`;
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", "data must be 0x-prefixed even-length hex.");
  }

  // 3. Estimate gas if not supplied (the estimate is provider data: it is checked against the ceiling)
  let gasLimit: bigint;
  if (request.gasLimit !== undefined) {
    gasLimit = request.gasLimit;
  } else {
    const estimated = await client.estimateGas({
      from: normalizedFrom,
      ...(normalizedTo ? { to: normalizedTo } : {}),
      value: `0x${value.toString(16)}`,
      data
    });
    const buffer = options.gasBufferPercentage ?? 20; // 20% safety margin by default
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 100) {
      throw new L2SafetyError("L2_INVALID_TX_PARAMS", `gasBufferPercentage must be 0..100 (got ${buffer}).`);
    }
    gasLimit = (estimated * BigInt(100 + buffer)) / 100n;
  }

  // 4. Resolve fees
  const nodeGasPrice = await client.getGasPriceWei();
  const effectiveGasPrice =
    options.minGasPriceWei !== undefined && options.minGasPriceWei > nodeGasPrice
      ? options.minGasPriceWei
      : nodeGasPrice;

  let prepared: EvmPreparedTransaction;
  if (txType === "eip1559") {
    let maxPriorityFee = request.maxPriorityFeePerGas;
    let maxFee = request.maxFeePerGas;

    if (maxPriorityFee === undefined) {
      // Heuristic: 10% of the node gas price, minimum 1 wei
      maxPriorityFee = (effectiveGasPrice * 10n) / 100n;
      if (maxPriorityFee < 1n) maxPriorityFee = 1n;
    }
    if (maxFee === undefined) {
      // Heuristic: 120% of the node gas price + priority fee
      maxFee = (effectiveGasPrice * 120n) / 100n + maxPriorityFee;
    }

    prepared = {
      ...(normalizedTo ? { to: normalizedTo } : {}),
      from: normalizedFrom,
      value,
      data,
      nonce,
      gasLimit,
      chainId: expectedChainId,
      type: "eip1559",
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPriorityFee
    };
  } else {
    prepared = {
      ...(normalizedTo ? { to: normalizedTo } : {}),
      from: normalizedFrom,
      value,
      data,
      nonce,
      gasLimit,
      chainId: expectedChainId,
      type: "legacy",
      gasPrice: request.gasPrice ?? effectiveGasPrice
    };
  }

  assertFeeWithinLimits(feeCheckInput(prepared), limits);
  return prepared;
}

export class UncertainBroadcastError extends Error {
  public readonly txHash: string;
  public readonly rawTransaction: string;
  public readonly cause: unknown;

  constructor(txHash: string, rawTransaction: string, cause: unknown) {
    super(
      `Transaction broadcast returned an uncertain result for txHash ${txHash}: ${
        cause instanceof Error ? cause.message : String(cause)
      }. Do not re-sign: poll this txHash.`
    );
    this.name = "UncertainBroadcastError";
    this.txHash = txHash;
    this.rawTransaction = rawTransaction;
    this.cause = cause;
  }
}

export interface SendRawTransactionResilientOptions extends L2WriteOptions {
  readonly maxReconcileAttempts?: number | undefined;
  readonly reconcileIntervalMs?: number | undefined;
}

/**
 * - submitted: node accepted the payload and returned keccak256(raw).
 * - already_known: node says it already holds this exact transaction (mempool claim, not inclusion).
 * - mined_after_lost_response: the response was lost but a receipt for keccak256(raw) exists.
 */
export type L2BroadcastState = "submitted" | "already_known" | "mined_after_lost_response";

export interface ResilientBroadcastResult {
  readonly txHash: `0x${string}`;
  readonly broadcastState: L2BroadcastState;
}

/**
 * Broadcasts an already-signed transaction. The txHash is always keccak256(raw):
 * a node answer that differs is rejected with L2TxHashMismatchError (never reported as success).
 * Re-sending the same raw transaction is idempotent; this function never re-signs.
 * The write guard runs first (bound chain, mainnet authorization, fee ceilings when resolvable):
 * nothing reaches the node otherwise.
 */
export async function sendRawTransactionResilient(
  client: EvmJsonRpcClient,
  rawTransaction: string,
  options: SendRawTransactionResilientOptions = {}
): Promise<ResilientBroadcastResult> {
  const normalizedRaw = (
    rawTransaction.startsWith("0x") ? rawTransaction : `0x${rawTransaction}`
  ) as `0x${string}`;
  assertRawTransactionAllowed(
    normalizedRaw,
    { ...options, operation: "sendRawTransactionResilient" },
    client
  );
  const deterministicTxHash = keccak256(normalizedRaw);

  let returned: unknown;
  try {
    // The client runs the same guard again before the RPC call (idempotent).
    returned = await client.sendRawTransaction(normalizedRaw, {
      ...options,
      operation: "sendRawTransactionResilient"
    });
  } catch (broadcastErr) {
    // A guard refusal inside the client is definite: nothing was sent, so nothing to reconcile.
    // (An invalid RPC response is not a refusal: the node may have accepted the payload.)
    if (broadcastErr instanceof L2SafetyError && broadcastErr.code !== "L2_RPC_RESPONSE_INVALID") {
      throw broadcastErr;
    }
    const msg =
      broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr);

    // An explicit JSON-RPC rejection is a definite answer; only transport failures are "lost".
    const isRpcRejection = broadcastErr instanceof EvmJsonRpcError;

    // 1. 'already known' = the node holds this exact payload (mempool), not proof of inclusion.
    // Wording differs per node: geth/reth "already known", Anvil 1.8.6 "transaction already imported" (-32003).
    if (isRpcRejection && /already known|known transaction|already in mempool|already imported/i.test(msg)) {
      return { txHash: deterministicTxHash, broadcastState: "already_known" };
    }

    // 2. 'nonce too low': ours was mined, or a competing tx consumed the nonce.
    if (isRpcRejection && /nonce too low/i.test(msg)) {
      const receipt = normalizeEvmTransactionReceipt(
        await client.getTransactionReceipt(deterministicTxHash)
      );
      if (receipt && receipt.txHash.toLowerCase() === deterministicTxHash) {
        return { txHash: deterministicTxHash, broadcastState: "mined_after_lost_response" };
      }
      throw new Error(
        `Nonce collision: node returned 'nonce too low', but transaction ${deterministicTxHash} was NOT found in receipts. A competing transaction consumed this nonce.`
      );
    }

    if (isRpcRejection) {
      // Definite rejection (insufficient funds, underpriced, invalid sig, ...).
      throw broadcastErr;
    }

    // 3. Transport failure / timeout: the node may have accepted it. Reconcile by hash.
    const maxAttempts = options.maxReconcileAttempts ?? 5;
    const intervalMs = options.reconcileIntervalMs ?? 100;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = normalizeEvmTransactionReceipt(
          await client.getTransactionReceipt(deterministicTxHash)
        );
        if (receipt && receipt.txHash.toLowerCase() === deterministicTxHash) {
          return { txHash: deterministicTxHash, broadcastState: "mined_after_lost_response" };
        }
      } catch {
        // reconciliation is best effort
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // 4. Still unknown: preserve the deterministic hash; the caller must poll, not re-sign.
    throw new UncertainBroadcastError(deterministicTxHash, normalizedRaw, broadcastErr);
  }

  if (!isHash32(returned) || returned.toLowerCase() !== deterministicTxHash.toLowerCase()) {
    throw new L2TxHashMismatchError(deterministicTxHash, returned, normalizedRaw);
  }
  return { txHash: deterministicTxHash, broadcastState: "submitted" };
}

export interface SendAndConfirmOptions extends L2WriteOptions {
  readonly timeoutMs?: number | undefined;
  readonly intervalMs?: number | undefined;
}

/**
 * Broadcasts a signed transaction and waits for its receipt.
 * - chain bound and re-checked against the RPC and the raw transaction,
 * - mainnet only with allowMainnet,
 * - txHash = keccak256(raw) (RPC answer verified),
 * - receipt must be for that hash; "unknown" status is an error, never success,
 * - no receipt in time -> L2TxPendingError (not a failure; do not re-sign).
 * The returned receipt is L2 execution as reported by the RPC; L1 settlement is not verified.
 */
export async function sendAndConfirmTransaction(
  client: EvmJsonRpcClient,
  rawTransaction: string,
  options: SendAndConfirmOptions = {}
): Promise<EvmTransactionReceiptSummary> {
  const { chainId } = assertRawTransactionAllowed(
    rawTransaction,
    { ...options, operation: "sendAndConfirmTransaction" },
    client
  );

  const rpcChainId = await client.getChainId();
  assertChainIdMatches(chainId, rpcChainId);

  const { txHash } = await sendRawTransactionResilient(client, rawTransaction, {
    expectedChainId: options.expectedChainId,
    profile: options.profile,
    allowMainnet: options.allowMainnet,
    feeLimits: options.feeLimits
  });

  const waitTimeout = options.timeoutMs ?? client.receiptWaitDefaults.timeoutMs;
  let rawReceipt: any;
  try {
    rawReceipt = await client.waitForTransactionReceipt(txHash, {
      timeoutMs: waitTimeout,
      intervalMs: options.intervalMs ?? client.receiptWaitDefaults.intervalMs
    });
  } catch (e) {
    if (e instanceof EvmRpcTimeoutError) throw new L2TxPendingError(txHash, waitTimeout);
    throw e;
  }
  const summary = normalizeEvmTransactionReceipt(rawReceipt);

  if (!summary) {
    throw new L2SafetyError("L2_RECEIPT_INVALID", `Failed to normalize transaction receipt for ${txHash}`);
  }
  if (summary.txHash.toLowerCase() !== txHash.toLowerCase()) {
    throw new L2TxHashMismatchError(txHash, summary.txHash, rawTransaction);
  }
  if (summary.status === "reverted") {
    throw new EvmTransactionRevertedError(txHash, summary);
  }
  if (summary.status !== "success") {
    throw new L2SafetyError(
      "L2_RECEIPT_STATUS_UNKNOWN",
      `Receipt for ${txHash} has no recognizable status (${JSON.stringify(summary.raw?.status)}); not treated as success.`,
      { txHash }
    );
  }

  return summary;
}
