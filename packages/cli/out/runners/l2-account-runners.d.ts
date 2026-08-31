export interface L2AccountOptions {
    network?: string;
    url?: string;
    chainId?: string | number;
    block?: "latest" | "pending";
    json?: boolean;
}
export declare function runL2Balance(address: string, options: L2AccountOptions): Promise<void>;
export declare function runL2Nonce(address: string, options: L2AccountOptions): Promise<void>;
//# sourceMappingURL=l2-account-runners.d.ts.map