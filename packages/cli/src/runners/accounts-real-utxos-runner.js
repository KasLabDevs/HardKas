import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompi } from "@hardkas/core";
import { resolveRuntimeConfig } from "@hardkas/node-orchestrator";
export async function runAccountsRealUtxos(options) {
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
    const utxos = await client.getUtxosByAddress(account.address);
    await client.close();
    const lines = [
        `UTXOs for ${account.name} (${account.address})`,
        `Network: ${options.network || "simnet"}`,
        `RPC:     ${rpcUrl}`,
        ""
    ];
    if (utxos.length === 0) {
        lines.push("No UTXOs found.");
    }
    else {
        utxos.forEach((u) => {
            lines.push(`${u.outpoint.transactionId}:${u.outpoint.index}`);
            lines.push(`  Amount: ${formatSompi(u.amountSompi)}`);
            lines.push("");
        });
    }
    return { formatted: lines.join("\n") };
}
//# sourceMappingURL=accounts-real-utxos-runner.js.map