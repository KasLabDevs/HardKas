import { SimulatedReplaySummary } from "@hardkas/localnet";
export interface ReplayRunnerInput {
    txId: string;
    cwd?: string;
}
export interface ReplayRunnerResult {
    replay: SimulatedReplaySummary;
    formatted: string;
}
export declare function runReplay(input: ReplayRunnerInput): Promise<ReplayRunnerResult>;
//# sourceMappingURL=replay-runner.d.ts.map