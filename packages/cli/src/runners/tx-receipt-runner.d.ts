import { StoredSimulatedTxReceipt } from "@hardkas/localnet";
export interface TxReceiptRunnerInput {
    txId: string;
    cwd?: string;
}
export interface TxReceiptRunnerResult {
    receipt: StoredSimulatedTxReceipt;
    formatted: string;
}
export declare function runTxReceipt(input: TxReceiptRunnerInput): Promise<TxReceiptRunnerResult>;
//# sourceMappingURL=tx-receipt-runner.d.ts.map