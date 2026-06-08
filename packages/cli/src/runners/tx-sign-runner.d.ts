import { TxPlanArtifact, SignedTxArtifact } from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
export interface TxSignRunnerInput {
    planArtifact: TxPlanArtifact;
    accountName?: string;
    config: HardkasConfig;
    allowMainnetSigning?: boolean;
    append?: boolean;
    threshold?: number;
    requiredSigners?: string[];
    workspaceRoot?: string;
    signer?: any;
}
/**
 * Reusable logic for transaction signing.
 */
export declare function runTxSign(input: TxSignRunnerInput): Promise<SignedTxArtifact>;
export declare function getNetworkFromAddress(address: string): string;
//# sourceMappingURL=tx-sign-runner.d.ts.map