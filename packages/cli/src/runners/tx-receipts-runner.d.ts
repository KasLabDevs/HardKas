import { StoredSimulatedTxReceipt } from "@hardkas/localnet";
export interface TxReceiptsRunnerInput {
    cwd?: string;
}
export interface TxReceiptsRunnerResult {
    receipts: StoredSimulatedTxReceipt[];
    formatted: string;
}
export declare function runTxReceipts(input: TxReceiptsRunnerInput): Promise<TxReceiptsRunnerResult>;
//# sourceMappingURL=tx-receipts-runner.d.ts.map