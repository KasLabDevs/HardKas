import { ServerInfo } from "@hardkas/kaspa-rpc";
export interface RpcInfoOptions {
    url?: string;
}
export declare function runRpcInfo(options?: RpcInfoOptions): Promise<{
    info?: ServerInfo;
    url: string;
    formatted: string;
}>;
//# sourceMappingURL=rpc-info-runner.d.ts.map