export interface TxReceiptRunnerInput {
    txId: string;
    cwd?: string;
}
export interface TxReceiptRunnerResult {
    receipt: any;
    formatted: string;
}
export declare function runTxReceipt(input: TxReceiptRunnerInput): Promise<TxReceiptRunnerResult>;
//# sourceMappingURL=tx-receipt-runner.d.ts.map