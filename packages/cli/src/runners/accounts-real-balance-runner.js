import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompi } from "@hardkas/core";
import { resolveRuntimeConfig } from "@hardkas/node-orchestrator";
export async function runAccountsRealBalance(options) {
    const cwd = options.workspaceRoot || process.cwd();
    const store = await loadRealAccountStore({ cwd });
    const account = store ? getRealDevAccount(store, options.name) : null;
    if (!account) {
        throw new Error(`Account '${options.name}' not found in real store.`);
    }
    let rpcUrl = options.url;
    if (!rpcUrl) {
        rpcUrl = resolveRuntimeConfig({
            network: (options.network ?? "simnet")
        }).rpcUrl;
    }
    const client = new JsonWrpcKaspaClient({ rpcUrl });
    const balance = await client.getBalanceByAddress(account.address);
    await client.close();
    const formatted = `${account.name} balance: ${formatSompi(balance.balanceSompi)} (${account.address})`;
    return {
        balanceSompi: balance.balanceSompi,
        formatted
    };
}
//# sourceMappingURL=accounts-real-balance-runner.js.map