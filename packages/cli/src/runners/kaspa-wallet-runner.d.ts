export declare function runKaspaWalletCreate(name: string, options: {
    network: string;
}): Promise<void>;
export declare function runKaspaWalletList(options: {
    json: boolean;
}): Promise<void>;
export declare function runKaspaWalletAddress(name: string): Promise<void>;
export declare function runKaspaWalletBalance(name: string, options: {
    rpcUrl: string;
    json: boolean;
}): Promise<void>;
export declare function runKaspaWalletSend(from: string, to: string, options: {
    amount: string;
    dryRun: boolean;
    rpcUrl: string;
}): Promise<void>;
//# sourceMappingURL=kaspa-wallet-runner.d.ts.map