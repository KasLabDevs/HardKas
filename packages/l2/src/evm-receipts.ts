export interface EvmTransactionReceiptSummary {
  txHash: string;
  blockHash?: string;
  blockNumber?: bigint | undefined;
  from?: string;
  to?: string | null | undefined;
  gasUsed?: bigint | undefined;
  effectiveGasPrice?: bigint | undefined;
  status?: "success" | "reverted" | "unknown";
  raw: any;
}

export function normalizeEvmTransactionReceipt(raw: any): EvmTransactionReceiptSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const txHash = raw.transactionHash;
  if (!txHash || typeof txHash !== "string") return null;

  let status: "success" | "reverted" | "unknown" = "unknown";
  if (raw.status === "0x1") status = "success";
  else if (raw.status === "0x0") status = "reverted";

  return {
    txHash,
    blockHash: typeof raw.blockHash === "string" ? raw.blockHash : undefined,
    blockNumber: raw.blockNumber ? BigInt(raw.blockNumber) : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" || raw.to === null ? raw.to : undefined,
    gasUsed: raw.gasUsed ? BigInt(raw.gasUsed) : undefined,
    effectiveGasPrice: raw.effectiveGasPrice ? BigInt(raw.effectiveGasPrice) : undefined,
    status,
    raw
  };
}
