import { loadOrCreateRealAccountStore, saveRealAccountStore, importRealDevAccount } from "@hardkas/accounts";
export async function runAccountsRealImport(options) {
    const cwd = options.workspaceRoot || process.cwd();
    let store = await loadOrCreateRealAccountStore({ cwd });
    store = importRealDevAccount(store, {
        name: options.name,
        address: options.address,
        ...(options.publicKey ? { publicKey: options.publicKey } : {}),
        ...(options.privateKey ? { privateKey: options.privateKey } : {})
    });
    await saveRealAccountStore(store, { cwd });
    return { formatted: `Account '${options.name}' imported successfully.` };
}
//# sourceMappingURL=accounts-real-import-runner.js.map