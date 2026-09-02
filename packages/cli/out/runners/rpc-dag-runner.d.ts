import { BlockDagInfo } from "@hardkas/kaspa-rpc";
export interface RpcDagOptions {
    url?: string;
}
export declare function runRpcDag(options?: RpcDagOptions): Promise<{
    dag: BlockDagInfo;
    formatted: string;
}>;
//# sourceMappingURL=rpc-dag-runner.d.ts.map