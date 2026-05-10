import { 
  loadSimulatedReceipt, 
  StoredSimulatedTxReceipt 
} from "@hardkas/localnet";
import { formatSompi } from "@hardkas/core";

export interface TxReceiptRunnerInput {
  txId: string;
  cwd?: string;
}

export interface TxReceiptRunnerResult {
  receipt: StoredSimulatedTxReceipt;
  formatted: string;
}

export async function runTxReceipt(input: TxReceiptRunnerInput): Promise<TxReceiptRunnerResult> {
  const { txId, cwd } = input;
  
  const receipt = await loadSimulatedReceipt(txId, cwd ? { cwd } : undefined);
  
  const lines = [
    "Transaction receipt",
    "",
    `Tx ID:     ${receipt.txId}`,
    `Mode:      ${receipt.mode}`,
    `Network:   ${receipt.networkId}`,
    `From:      ${receipt.from.address}`,
    `To:        ${receipt.to.address}`,
    `Amount:    ${formatSompi(BigInt(receipt.amountSompi))}`,
    `Fee:       ${formatSompi(BigInt(receipt.feeSompi))}`,
    `Change:    ${receipt.changeSompi ? formatSompi(BigInt(receipt.changeSompi)) : "none"}`,
    `DAA score: ${receipt.daaScore}`,
    `Created:   ${receipt.createdAt}`,
    "",
    "State:",
    `  Spent UTXOs:   ${receipt.spentUtxoIds.length}`,
    `  Created UTXOs: ${receipt.createdUtxoIds.length}`
  ];
  
  return {
    receipt,
    formatted: lines.join("\n")
  };
}
