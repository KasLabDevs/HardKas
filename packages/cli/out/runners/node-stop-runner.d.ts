import { KaspadNodeStatus } from "@hardkas/node-runner";
export interface NodeStopRunnerInput {
    containerName?: string;
}
export declare function runNodeStop(input: NodeStopRunnerInput): Promise<KaspadNodeStatus>;
//# sourceMappingURL=node-stop-runner.d.ts.map