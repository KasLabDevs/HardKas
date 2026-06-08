import { MempoolEntry } from "@hardkas/kaspa-rpc";
export interface RpcMempoolOptions {
    txId: string;
    url?: string;
}
export declare function runRpcMempool(options: RpcMempoolOptions): Promise<{
    entry: MempoolEntry | null;
    formatted: string;
}>;
//# sourceMappingURL=rpc-mempool-runner.d.ts.map