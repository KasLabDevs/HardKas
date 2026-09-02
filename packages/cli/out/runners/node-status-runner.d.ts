import { KaspadNodeStatus } from "@hardkas/node-runner";
export interface NodeStatusRunnerInput {
    containerName?: string;
}
export interface NodeStatusRunnerResult {
    status: KaspadNodeStatus;
    formatted: string;
}
export declare function runNodeStatus(input: NodeStatusRunnerInput): Promise<NodeStatusRunnerResult>;
//# sourceMappingURL=node-status-runner.d.ts.map