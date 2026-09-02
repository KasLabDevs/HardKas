export interface AccountsConsolidateOptions {
    account: string;
    network?: string | undefined;
    provider?: string | undefined;
    url?: string | undefined;
    targetUtxos: number;
    batchSize: number;
    minUtxo?: bigint | undefined;
    dryRun: boolean;
    execute: boolean;
    yes: boolean;
    allowMainnet: boolean;
    json: boolean;
}
export declare function runAccountsConsolidate(options: AccountsConsolidateOptions): Promise<void>;
//# sourceMappingURL=accounts-consolidate-runner.d.ts.map