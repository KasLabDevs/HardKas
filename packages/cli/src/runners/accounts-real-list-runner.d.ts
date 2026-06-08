import { RealDevAccount } from "@hardkas/accounts";
export interface AccountsRealListOptions {
    workspaceRoot?: string;
}
export declare function runAccountsRealList(options?: AccountsRealListOptions): Promise<{
    accounts: readonly RealDevAccount[];
    formatted: string;
}>;
//# sourceMappingURL=accounts-real-list-runner.d.ts.map