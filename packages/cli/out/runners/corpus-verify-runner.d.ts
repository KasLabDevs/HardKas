import { HardkasSchemas } from "@hardkas/artifacts";
export interface CorpusVerifyOptions {
    path: string;
    json?: boolean;
    workspaceRoot?: string;
}
interface CorpusIssue {
    code: string;
    message: string;
    file?: string;
}
interface CorpusVerifyResult {
    ok: boolean;
    schema: typeof HardkasSchemas.ToccataCorpusV1;
    path: string;
    summary: {
        happyPathFixtures: number;
        failureFixtures: number;
        artifactsChecked: number;
        contentHashes: "PASS" | "FAIL";
        compareMode: string;
        simulationStatus: string;
        knownLimitations: string[];
    };
    claims: {
        artifactCoherence: "READY_MATCH" | "INVALID";
        runtimeOutcome: "PARTIAL" | "INVALID";
        vmConsensusEquivalence: "NOT_CLAIMED" | "INVALID";
        mainnet: "BLOCKED_BY_POLICY" | "INVALID";
    };
    issues: CorpusIssue[];
}
export declare function runCorpusVerify(options: CorpusVerifyOptions): Promise<CorpusVerifyResult>;
export {};
//# sourceMappingURL=corpus-verify-runner.d.ts.map