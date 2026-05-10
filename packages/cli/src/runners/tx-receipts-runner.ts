import { 
  listSimulatedReceipts, 
  StoredSimulatedTxReceipt 
} from "@hardkas/localnet";
import { formatSompi } from "@hardkas/core";

export interface TxReceiptsRunnerInput {
  cwd?: string;
}

export interface TxReceiptsRunnerResult {
  receipts: StoredSimulatedTxReceipt[];
  formatted: string;
}

export async function runTxReceipts(input: TxReceiptsRunnerInput): Promise<TxReceiptsRunnerResult> {
  const { cwd } = input;
  
  const receipts = await listSimulatedReceipts(cwd ? { cwd } : undefined);
  
  if (receipts.length === 0) {
    return {
      receipts: [],
      formatted: "No receipts found."
    };
  }
  
  const lines = ["Receipts", ""];
  
  for (const r of receipts) {
    const id = r.txId.substring(0, 15) + "...";
    const amount = formatSompi(BigInt(r.amountSompi));
    lines.push(`${id.padEnd(18)} ${r.mode.padEnd(10)} ${r.networkId.padEnd(8)} DAA ${r.daaScore.padEnd(5)} ${amount}`);
  }
  
  return {
    receipts,
    formatted: lines.join("\n")
  };
}
