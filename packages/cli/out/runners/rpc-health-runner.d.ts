import { RpcHealthResult } from "@hardkas/kaspa-rpc";
export interface RpcHealthRunnerOptions {
    url?: string;
    wait?: boolean;
    timeout?: number;
    interval?: number;
}
export declare function runRpcHealth(options: RpcHealthRunnerOptions): Promise<{
    result: RpcHealthResult;
    formatted: string;
    durationMs: number;
}>;
//# sourceMappingURL=rpc-health-runner.d.ts.map