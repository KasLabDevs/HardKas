import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
export async function runAccountsRealShow(options) {
    const cwd = options.workspaceRoot || process.cwd();
    const store = await loadRealAccountStore({ cwd });
    const account = store ? getRealDevAccount(store, options.name) : null;
    if (!account) {
        throw new Error(`Account '${options.name}' not found in real store.`);
    }
    const lines = [
        `Account: ${account.name}`,
        `Address: ${account.address}`,
        `Created: ${account.createdAt}`,
        ""
    ];
    if (account.publicKey)
        lines.push(`Public Key:  ${account.publicKey}`);
    if (account.privateKey) {
        const pk = options.showPrivate ? account.privateKey : "[masked]";
        lines.push(`Private Key: ${pk}${options.showPrivate ? " (plaintext)" : ""}`);
    }
    return { formatted: lines.join("\n") };
}
//# sourceMappingURL=accounts-real-show-runner.js.map