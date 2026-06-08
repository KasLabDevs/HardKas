import { loadRealAccountStore, saveRealAccountStore, createEmptyRealAccountStore, getDefaultRealAccountsPath } from "@hardkas/accounts";
export async function runAccountsRealInit(options = {}) {
    const cwd = options.workspaceRoot || process.cwd();
    const filePath = getDefaultRealAccountsPath(cwd);
    const existing = await loadRealAccountStore({ cwd });
    if (existing && !options.force) {
        throw new Error(`Real account store already exists at ${filePath}. Use --force to overwrite.`);
    }
    const store = createEmptyRealAccountStore();
    await saveRealAccountStore(store, { cwd });
    const lines = [
        "Real dev account store initialized",
        "",
        `Path:    ${filePath}`,
        `Network: ${store.networkId}`,
        "",
        "WARNING:",
        "  Development keys only. Do not use on mainnet."
    ];
    return {
        path: filePath,
        formatted: lines.join("\n")
    };
}
//# sourceMappingURL=accounts-real-init-runner.js.map