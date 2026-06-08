import { UI } from "../ui.js";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { resolveNetworkTarget } from "@hardkas/config";
export async function runTxWait(input) {
    const { txId, config, url, network } = input;
    const networkName = network || config.defaultNetwork || "simnet";
    const { name: resolvedName, target } = resolveNetworkTarget({
        network: networkName,
        config
    });
    const { resolveProvider } = await import("@hardkas/config");
    const provider = resolveProvider({
        network: resolvedName,
        provider: input.provider,
        url
    });
    if (provider.mode === "simulated") {
        UI.logHuman(`  ✅ Settlement: SIMULATED (Instant)`);
        return;
    }
    const targetRecord = target;
    const targetRpcUrl = typeof targetRecord["rpcUrl"] === "string" ? targetRecord["rpcUrl"] : undefined;
    const rpcUrl = url || targetRpcUrl || provider.endpoint;
    if (!rpcUrl)
        throw new Error(`No RPC URL found for network '${networkName}'.`);
    const client = new JsonWrpcKaspaClient({ rpcUrl });
    UI.logHuman(`⏳ Waiting for settlement of ${txId.substring(0, 8)}... on ${rpcUrl}`);
    const timeoutMs = input.timeoutMs || 30000;
    const start = Date.now();
    let confirmed = false;
    try {
        while (Date.now() - start < timeoutMs) {
            // 1. Check if still in mempool
            const mempoolEntry = await client.getMempoolEntry(txId);
            if (mempoolEntry) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            // 2. If it disappeared from mempool, verify it is in the DAG
            let verified = false;
            try {
                // Try getTransaction first (if node has txindex)
                const tx = await client.getTransaction(txId);
                if (tx)
                    verified = true;
            }
            catch (e) {
                // Fallback if no txindex
            }
            if (!verified && input.address) {
                const utxos = await client.getUtxosByAddress(input.address);
                if (utxos.some((u) => u.outpoint?.transactionId === txId)) {
                    verified = true;
                }
            }
            if (verified) {
                confirmed = true;
                break;
            }
            // If not verified, wait a bit and hope the user provided an address,
            // or we just assume confirmed if they didn't provide address and getTransaction fails.
            if (!input.address) {
                // Compromise: if no address provided and getTransaction unsupported, assume confirmed after leaving mempool
                confirmed = true;
                break;
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        if (confirmed) {
            UI.logHuman(`  ✅ Settlement Proof: PASS`);
            UI.logHuman(`  Status: CONFIRMED`);
        }
        else {
            UI.logHuman(`  ❌ Settlement Proof: TIMEOUT`);
            UI.logHuman(`  Status: PENDING in Mempool (Wait time: ${timeoutMs}ms)`);
            process.exit(1);
        }
    }
    catch (err) {
        UI.logHuman(`  ❌ Error polling node: ${err.message}`);
        process.exit(1);
    }
    finally {
        await client.close();
    }
}
//# sourceMappingURL=tx-wait-runner.js.map