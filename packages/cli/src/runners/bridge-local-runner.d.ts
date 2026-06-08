export declare function runBridgeLocalPlan(options: {
    from?: string;
    toIgra?: string;
    session?: string;
    amount: string;
    json: boolean;
}): Promise<void>;
export declare function runBridgeLocalSimulate(options: {
    from?: string;
    toIgra?: string;
    session?: string;
    amount: string;
    prefix: string;
    json: boolean;
}): Promise<void>;
export declare function runBridgeLocalInspect(txid: string, options: {
    json: boolean;
}): Promise<void>;
//# sourceMappingURL=bridge-local-runner.d.ts.map