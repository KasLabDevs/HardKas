import { L2SafetyError } from "./errors.js";
import { isAddress, isHash32, parseHexQuantity } from "./hex.js";

/**
 * Normalized summary of an EVM transaction receipt.
 *
 * NOTE ON FINALITY:
 * A receipt is L2 execution as reported by the RPC provider (not a cryptographic proof).
 * Settlement on Kaspa L1 is not verified by HardKAS: `l1SettlementStatus` is always
 * "unverified_on_l1".
 */
export interface EvmTransactionReceiptSummary {
  readonly txHash: string;
  readonly blockHash?: string | undefined;
  readonly blockNumber?: bigint | undefined;
  readonly from?: string | undefined;
  readonly to?: string | null | undefined;
  readonly contractAddress?: string | null | undefined;
  readonly gasUsed?: bigint | undefined;
  readonly effectiveGasPrice?: bigint | undefined;
  /** "unknown" means the RPC returned no recognizable status; it is never success. */
  readonly status: "success" | "reverted" | "unknown";
  readonly executionScope: "l2_execution";
  readonly observation: "rpc_reported";
  readonly l1SettlementStatus: "unverified_on_l1";
  readonly raw: any;
}

function invalid(field: string, value: unknown): never {
  throw new L2SafetyError(
    "L2_RECEIPT_INVALID",
    `Invalid receipt field ${field}: ${JSON.stringify(value)}`,
    { field, value }
  );
}

function optionalQuantity(raw: any, field: string): bigint | undefined {
  const v = raw[field];
  if (v === undefined || v === null) return undefined;
  try {
    return parseHexQuantity(v, `receipt.${field}`);
  } catch {
    return invalid(field, v);
  }
}

/**
 * Strictly normalizes a receipt. Returns null only for "no receipt" (null/undefined input).
 * Malformed receipts throw L2_RECEIPT_INVALID instead of being half-parsed.
 */
export function normalizeEvmTransactionReceipt(
  raw: any
): EvmTransactionReceiptSummary | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) invalid("receipt", raw);

  const txHash = raw.transactionHash;
  if (!isHash32(txHash)) invalid("transactionHash", txHash);

  let status: "success" | "reverted" | "unknown" = "unknown";
  if (raw.status === "0x1") status = "success";
  else if (raw.status === "0x0") status = "reverted";

  if (raw.blockHash !== undefined && raw.blockHash !== null && !isHash32(raw.blockHash)) {
    invalid("blockHash", raw.blockHash);
  }
  if (raw.from !== undefined && raw.from !== null && !isAddress(raw.from)) {
    invalid("from", raw.from);
  }
  if (raw.to !== undefined && raw.to !== null && !isAddress(raw.to)) {
    invalid("to", raw.to);
  }
  if (
    raw.contractAddress !== undefined &&
    raw.contractAddress !== null &&
    !isAddress(raw.contractAddress)
  ) {
    invalid("contractAddress", raw.contractAddress);
  }

  return {
    txHash,
    blockHash: typeof raw.blockHash === "string" ? raw.blockHash : undefined,
    blockNumber: optionalQuantity(raw, "blockNumber"),
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" || raw.to === null ? raw.to : undefined,
    contractAddress:
      typeof raw.contractAddress === "string" || raw.contractAddress === null
        ? raw.contractAddress
        : undefined,
    gasUsed: optionalQuantity(raw, "gasUsed"),
    effectiveGasPrice: optionalQuantity(raw, "effectiveGasPrice"),
    status,
    executionScope: "l2_execution",
    observation: "rpc_reported",
    l1SettlementStatus: "unverified_on_l1",
    raw
  };
}
