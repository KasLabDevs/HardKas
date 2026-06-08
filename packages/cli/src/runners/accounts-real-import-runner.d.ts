export interface AccountsRealImportOptions {
    name: string;
    address: string;
    publicKey?: string;
    privateKey?: string;
    workspaceRoot?: string;
}
export declare function runAccountsRealImport(options: AccountsRealImportOptions): Promise<{
    formatted: string;
}>;
//# sourceMappingURL=accounts-real-import-runner.d.ts.map