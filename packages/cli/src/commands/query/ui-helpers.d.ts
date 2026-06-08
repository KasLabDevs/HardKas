import { QueryResult, ArtifactQueryItem, ArtifactInspectResult, ArtifactDiffResult, LineageChainResult, LineageTransition, LineageOrphan, ReplaySummaryResult, ReplayDivergence, ReplayInvariantsResult, DagConflict, DagDisplacement, DagTxHistory, DagSinkPath, DagAnomaly } from "@hardkas/query";
export interface ReasoningStep {
    order: number;
    assertion: string;
    rule?: string;
}
export interface ExplainChain {
    question: string;
    steps: ReasoningStep[];
    conclusion: string;
    model: string;
    confidence: string;
}
export declare function printArtifactList(result: QueryResult<ArtifactQueryItem>): void;
export declare function printInspectResult(result: QueryResult<ArtifactInspectResult>): void;
export declare function printDiffResult(result: QueryResult<ArtifactDiffResult>): void;
export declare function printLineageChain(result: QueryResult<LineageChainResult>): void;
export declare function printTransitions(result: QueryResult<LineageTransition>): void;
export declare function printOrphans(result: QueryResult<LineageOrphan>): void;
export declare function printReplayList(result: QueryResult<ReplaySummaryResult>): void;
export declare function printReplaySummary(result: QueryResult<ReplaySummaryResult>): void;
export declare function printDivergences(result: QueryResult<ReplayDivergence>): void;
export declare function printInvariants(result: QueryResult<ReplayInvariantsResult>): void;
export declare function printDagConflicts(result: QueryResult<DagConflict>): void;
export declare function printDagDisplaced(result: QueryResult<DagDisplacement>): void;
export declare function printDagHistory(result: QueryResult<DagTxHistory>): void;
export declare function printSinkPath(result: QueryResult<DagSinkPath>): void;
export declare function printDagAnomalies(result: QueryResult<DagAnomaly>): void;
export declare function printRpcHealthTimeline(result: QueryResult<any>): void;
export declare function printRpcDegradations(result: QueryResult<any>): void;
export declare function printRpcCorrelation(result: QueryResult<any>): void;
export declare function printCorrelationBundle(result: QueryResult<any>): void;
export declare function printExplainChains(chains: ExplainChain[]): void;
//# sourceMappingURL=ui-helpers.d.ts.map