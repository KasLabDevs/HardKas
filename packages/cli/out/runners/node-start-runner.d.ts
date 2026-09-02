import { DockerKaspadOptions, KaspadNodeStatus } from "@hardkas/node-runner";
export interface NodeStartRunnerInput extends DockerKaspadOptions {
    json?: boolean;
}
export interface NodeStartRunnerResult {
    status: KaspadNodeStatus;
    formatted: string;
}
export declare function runNodeStart(input: NodeStartRunnerInput): Promise<NodeStartRunnerResult>;
//# sourceMappingURL=node-start-runner.d.ts.map