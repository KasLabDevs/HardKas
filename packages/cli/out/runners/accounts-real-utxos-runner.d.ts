export interface AccountsRealUtxosOptions {
    name: string;
    network?: "simnet" | "testnet-10" | "mainnet";
    url?: string;
    workspaceRoot?: string;
}
export declare function runAccountsRealUtxos(options: AccountsRealUtxosOptions): Promise<{
    formatted: string;
}>;
//# sourceMappingURL=accounts-real-utxos-runner.d.ts.map