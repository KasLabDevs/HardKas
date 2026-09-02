import { KaspadNodeStatus } from "@hardkas/node-runner";
export interface NodeRestartRunnerInput {
    containerName?: string;
    image?: string;
}
export interface NodeRestartRunnerResult {
    status: KaspadNodeStatus;
    formatted: string;
}
export declare function runNodeRestart(input: NodeRestartRunnerInput): Promise<NodeRestartRunnerResult>;
//# sourceMappingURL=node-restart-runner.d.ts.map