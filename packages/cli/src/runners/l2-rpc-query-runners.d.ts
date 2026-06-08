export interface L2RpcQueryOptions {
    network?: string;
    url?: string;
    json?: boolean;
}
export declare function runL2RpcChainId(options: L2RpcQueryOptions): Promise<void>;
export declare function runL2RpcBlockNumber(options: L2RpcQueryOptions): Promise<void>;
export declare function runL2RpcGasPrice(options: L2RpcQueryOptions): Promise<void>;
//# sourceMappingURL=l2-rpc-query-runners.d.ts.map