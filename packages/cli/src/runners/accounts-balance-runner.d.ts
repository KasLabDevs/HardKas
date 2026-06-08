export interface AccountBalanceResult {
    name: string;
    address: string;
    balanceSompi: bigint;
    utxoCount: number;
    network: string;
}
export interface AccountsBalanceOptions {
    identifier: string;
    network?: string;
    provider?: string;
    url?: string;
    local?: boolean;
}
export declare function runAccountsBalance(options: AccountsBalanceOptions): Promise<AccountBalanceResult>;
//# sourceMappingURL=accounts-balance-runner.d.ts.map