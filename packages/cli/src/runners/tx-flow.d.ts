import { TxSendRunnerResult } from "./tx-send-runner.js";
import { TxPlanArtifact, SignedTxArtifact } from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
export interface TxFlowInput {
    from: string;
    to: string;
    amount: string;
    network?: string;
    config: HardkasConfig;
    url?: string;
    feeRate: string;
    provider?: string;
    planOnly?: boolean;
    sign?: boolean;
    send?: boolean;
    yes?: boolean;
    outDir?: string;
    name?: string;
    allowMainnetSigning?: boolean;
    workspaceRoot?: string;
}
export interface TxFlowStepResult<T> {
    status: "ok" | "skipped" | "blocked" | "error";
    artifact?: T;
    artifactPath?: string;
    error?: string;
    reason?: string;
}
export interface TxFlowResult {
    ok: boolean;
    networkId: string;
    mode: string;
    steps: {
        plan: TxFlowStepResult<TxPlanArtifact>;
        sign: TxFlowStepResult<SignedTxArtifact>;
        send: TxFlowStepResult<TxSendRunnerResult>;
    };
    result: "planned-only" | "signed" | "broadcast" | "not-broadcast";
}
/**
 * Orchestrates the full transaction workflow: plan -> sign -> send.
 */
export declare function runTxFlow(input: TxFlowInput): Promise<TxFlowResult>;
//# sourceMappingURL=tx-flow.d.ts.map