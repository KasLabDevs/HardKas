export interface L2RpcHealthOptions {
    network?: string;
    url?: string;
    json?: boolean;
    wait?: boolean;
    timeout?: number;
    interval?: number;
}
export declare function runL2RpcHealth(options: L2RpcHealthOptions): Promise<void>;
//# sourceMappingURL=l2-rpc-health-runner.d.ts.map