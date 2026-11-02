/**
 * Typed errors of the L2 safety layer. Every refusal carries a stable `code` so callers
 * (CLI, SDK users, tests) can branch on it without parsing messages.
 */
export type L2SafetyErrorCode =
  | "L2_PROFILE_AMBIGUOUS"
  | "L2_PROFILE_INVALID"
  | "L2_CHAIN_ID_REQUIRED"
  | "L2_CHAIN_ID_MISMATCH"
  | "L2_CHAIN_ID_INVALID"
  | "L2_MAINNET_WRITE_BLOCKED"
  | "L2_WRITE_DISABLED"
  | "L2_ENDPOINT_MISMATCH"
  | "L2_FEE_POLICY_REQUIRED"
  | "L2_FEE_LIMIT_EXCEEDED"
  | "L2_INVALID_TX_PARAMS"
  | "L2_TX_HASH_MISMATCH"
  | "L2_CONTRACT_ADDRESS_MISMATCH"
  | "L2_RPC_RESPONSE_INVALID"
  | "L2_RPC_METHOD_FORBIDDEN"
  | "L2_RECEIPT_INVALID"
  | "L2_RECEIPT_STATUS_UNKNOWN"
  | "L2_TX_PENDING"
  | "L2_SIGNED_TX_MISMATCH";

export class L2SafetyError extends Error {
  public readonly code: L2SafetyErrorCode;
  public readonly details?: Readonly<Record<string, unknown>> | undefined;

  constructor(code: L2SafetyErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "L2SafetyError";
    this.code = code;
    this.details = details;
  }
}

export class EvmSignerChainMismatchError extends L2SafetyError {
  constructor(expectedChainId: number, targetChainId: number) {
    super(
      "L2_CHAIN_ID_MISMATCH",
      `Chain ID mismatch: operation expects chain ${expectedChainId}, but the target reports chain ${targetChainId}.`,
      { expected: expectedChainId, actual: targetChainId }
    );
    this.name = "EvmSignerChainMismatchError";
  }
}

/** The RPC reported a txHash that is not keccak256 of the raw transaction we sent. */
export class L2TxHashMismatchError extends L2SafetyError {
  public readonly expectedTxHash: string;
  public readonly returnedTxHash: unknown;
  public readonly rawTransaction: string;

  constructor(expectedTxHash: string, returnedTxHash: unknown, rawTransaction: string) {
    super(
      "L2_TX_HASH_MISMATCH",
      `RPC returned txHash ${JSON.stringify(returnedTxHash)} but keccak256(rawTransaction) is ${expectedTxHash}. ` +
        "The response is rejected; the transaction may or may not have been accepted by the node.",
      { expectedTxHash, returnedTxHash }
    );
    this.name = "L2TxHashMismatchError";
    this.expectedTxHash = expectedTxHash;
    this.returnedTxHash = returnedTxHash;
    this.rawTransaction = rawTransaction;
  }
}

/**
 * The transaction was (or may have been) broadcast but no receipt was observed in time.
 * This is NOT a failure: the transaction may still be mined. Do not re-sign; poll the hash.
 */
export class L2TxPendingError extends L2SafetyError {
  public readonly txHash: string;

  constructor(txHash: string, waitedMs: number) {
    super(
      "L2_TX_PENDING",
      `No receipt for ${txHash} after ${waitedMs}ms. The transaction is pending or unknown to this node; ` +
        "it has not been shown to fail. Poll the same hash instead of signing again.",
      { txHash, waitedMs }
    );
    this.name = "L2TxPendingError";
    this.txHash = txHash;
  }
}
