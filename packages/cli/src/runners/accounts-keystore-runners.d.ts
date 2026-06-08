/**
 * Runner for 'hardkas accounts import --encrypted'
 */
export declare function runAccountsKeystoreImport(options: {
    name?: string;
    address?: string;
    privateKey?: string;
    privateKeyStdin?: boolean;
    privateKeyEnv?: string;
    passwordStdin?: boolean;
    passwordEnv?: string;
    unsafePlaintext?: boolean;
    fixture?: string;
    yes?: boolean;
    json?: boolean;
    workspaceRoot: string;
}): Promise<{
    success: boolean;
    name: string;
    encrypted: boolean;
    warnings: {
        code: string;
        severity: string;
        message: string;
    }[];
    formatted: string;
}>;
/**
 * Runner for 'hardkas accounts session-open <name>'
 */
export declare function runAccountsSessionOpen(options: {
    name: string;
    passwordStdin?: boolean;
    passwordEnv?: string;
    workspaceRoot: string;
}): Promise<void>;
/**
 * Runner for 'hardkas accounts change-password <name>'
 */
export declare function runAccountsKeystoreChangePassword(options: {
    name: string;
    workspaceRoot: string;
}): Promise<void>;
//# sourceMappingURL=accounts-keystore-runners.d.ts.map