export interface ReplayDiffOptions {
    idA: string;
    idB: string;
    json?: boolean;
    network: string;
    workspaceRoot: string;
}
export declare function runReplayDiff(options: ReplayDiffOptions): Promise<void>;
//# sourceMappingURL=replay-diff-runner.d.ts.map