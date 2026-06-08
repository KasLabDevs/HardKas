import { TxPlanArtifact } from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
export interface TxPlanRunnerInput {
    from: string;
    to: string;
    amount: string;
    networkId: string;
    feeRate: string;
    provider: string;
    config: HardkasConfig;
    url?: string;
    workspaceRoot?: string;
    workflowId?: string;
    assumptionLevel?: string;
}
/**
 * Reusable logic for transaction planning.
 */
export declare function runTxPlan(input: TxPlanRunnerInput): Promise<TxPlanArtifact>;
//# sourceMappingURL=tx-plan-runner.d.ts.map