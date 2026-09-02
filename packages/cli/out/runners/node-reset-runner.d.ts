import { KaspadNodeStatus } from "@hardkas/node-runner";
export interface NodeResetRunnerInput {
    containerName?: string;
    removeData?: boolean;
}
export interface NodeResetRunnerResult {
    status: KaspadNodeStatus;
    formatted: string;
}
export declare function runNodeReset(input: NodeResetRunnerInput): Promise<NodeResetRunnerResult>;
//# sourceMappingURL=node-reset-runner.d.ts.map