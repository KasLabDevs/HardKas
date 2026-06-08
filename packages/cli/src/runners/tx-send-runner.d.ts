import { SignedTxArtifact, TxReceiptArtifact } from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
export interface TxSendRunnerInput {
    signedArtifact: SignedTxArtifact;
    network?: string;
    config: HardkasConfig;
    url?: string;
    provider?: string;
    workspaceRoot?: string;
}
export interface TxSendRunnerResult {
    accepted: boolean;
    txId: string;
    rpcUrl: string;
    networkName: string;
    receipt: TxReceiptArtifact;
    receiptPath?: string | undefined;
    executionId?: string;
    replayId?: string;
}
/**
 * CLI Runner for transaction broadcasting.
 * Delegates core logic to the HardKAS SDK.
 */
export declare function runTxSend(input: TxSendRunnerInput): Promise<TxSendRunnerResult>;
//# sourceMappingURL=tx-send-runner.d.ts.map