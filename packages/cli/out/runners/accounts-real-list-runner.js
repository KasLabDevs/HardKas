import { loadRealAccountStore, listRealDevAccounts } from "@hardkas/accounts";
export async function runAccountsRealList(options = {}) {
    const cwd = options.workspaceRoot || process.cwd();
    const store = await loadRealAccountStore({ cwd });
    if (!store)
        return {
            accounts: [],
            formatted: "Real account store not found (run 'hardkas accounts real init')."
        };
    const accounts = listRealDevAccounts(store);
    if (accounts.length === 0)
        return { accounts: [], formatted: "No real dev accounts found." };
    const lines = ["Real dev accounts:", ""];
    accounts.forEach((acc) => {
        lines.push(`${acc.name.padEnd(12)} ${acc.address}`);
    });
    return {
        accounts,
        formatted: lines.join("\n")
    };
}
//# sourceMappingURL=accounts-real-list-runner.js.map