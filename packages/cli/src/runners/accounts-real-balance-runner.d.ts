export interface AccountsRealBalanceOptions {
    name: string;
    network?: "simnet" | "testnet-10" | "mainnet";
    url?: string;
    workspaceRoot?: string;
}
export declare function runAccountsRealBalance(options: AccountsRealBalanceOptions): Promise<{
    balanceSompi: bigint;
    formatted: string;
}>;
//# sourceMappingURL=accounts-real-balance-runner.d.ts.map