import { EscrowConfig, EscrowState, EscrowArtifact } from "./types.js";
export declare function createEscrow(config: EscrowConfig, silvercPath: string, workDir: string, escrowSilPath: string): Promise<{
    state: EscrowState;
    artifact: EscrowArtifact;
}>;
//# sourceMappingURL=create-escrow.d.ts.map