import { StoredSimulatedTxTrace } from "@hardkas/localnet";
export interface TraceRunnerInput {
    txId: string;
    cwd?: string;
}
export interface TraceRunnerResult {
    trace: StoredSimulatedTxTrace;
    formatted: string;
}
export declare function runTrace(input: TraceRunnerInput): Promise<TraceRunnerResult>;
//# sourceMappingURL=trace-runner.d.ts.map