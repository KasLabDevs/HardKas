import { RealDevAccount } from "@hardkas/accounts";
export interface AccountsRealGenerateOptions {
    name?: string;
    count?: number;
    networkId?: "simnet" | "testnet-10" | "mainnet";
    unsafePlaintext?: boolean;
    passwordStdin?: boolean;
    passwordEnv?: string;
    yes?: boolean;
    workspaceRoot?: string;
}
export declare function runAccountsRealGenerate(options: AccountsRealGenerateOptions): Promise<{
    accounts: RealDevAccount[];
    formatted: string;
}>;
//# sourceMappingURL=accounts-real-generate-runner.d.ts.map