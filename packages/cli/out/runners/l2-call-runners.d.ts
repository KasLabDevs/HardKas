export interface L2CallRunnerOptions {
    network?: string;
    url?: string;
    from?: string;
    to: string;
    data?: string;
    value?: string;
    block?: "latest" | "pending";
    json?: boolean;
}
export declare function runL2Call(options: L2CallRunnerOptions): Promise<void>;
export declare function runL2EstimateGas(options: L2CallRunnerOptions): Promise<void>;
//# sourceMappingURL=l2-call-runners.d.ts.map