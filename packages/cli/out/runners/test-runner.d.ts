export interface TestRunnerOptions {
    files: string[];
    network: string;
    watch?: boolean;
    json?: boolean;
    reporter?: string;
    massReport?: boolean;
    massSnapshot?: string;
    massCompare?: string;
    workspaceRoot?: string;
    keepRuns?: boolean;
    evidence?: boolean;
    scenario?: string;
}
/**
 * HardKAS Scenario Runner (v1)
 *
 * Replaces the previous mock with a real discovery and execution engine.
 * Currently uses a thin wrapper around Vitest if available.
 */
export declare function runTest(options: TestRunnerOptions): Promise<void>;
//# sourceMappingURL=test-runner.d.ts.map