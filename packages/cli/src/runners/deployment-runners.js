import { UI } from "../ui.js";
import { withLock } from "@hardkas/core";
import { saveDeployment, loadDeployment, listDeployments, createDeploymentRecord, updateDeploymentStatus } from "@hardkas/artifacts";
import { loadHardkasConfig, resolveNetworkTarget } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
// SAFETY_LEVEL: SIMULATION_ONLY
export async function runDeploymentInspect(options) {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    const rootDir = sdk.workspace.root;
    await withLock({ rootDir, name: "artifacts", command: "hardkas deploy track" }, async () => {
        await trackDeploymentInternal(rootDir, {
            label: options.label,
            network: options.network || "simnet",
            silent: !!options.json
        });
    });
}
export async function trackDeployment(opts) {
    const rootDir = opts.workspaceRoot || process.cwd();
    await withLock({ rootDir, name: "artifacts", command: "hardkas deploy track" }, async () => {
        await trackDeploymentInternal(rootDir, opts);
    });
}
export async function trackDeploymentInternal(rootDir, opts) {
    const existing = await loadDeployment(rootDir, opts.network, opts.label);
    if (existing) {
        throw new Error(`Deployment '${opts.label}' already exists on network '${opts.network}'.`);
    }
    const record = createDeploymentRecord({
        label: opts.label,
        networkId: opts.network,
        ...(opts.txId ? { txId: opts.txId } : {}),
        ...(opts.plan ? { planArtifactId: opts.plan } : {}),
        ...(opts.receipt ? { receiptArtifactId: opts.receipt } : {}),
        status: (opts.status || "sent"),
        ...(opts.notes ? { notes: opts.notes } : {})
    });
    await saveDeployment(rootDir, record);
    if (!opts.silent) {
        UI.success(`Tracked deployment: ${opts.label} (${opts.network})`);
    }
}
export async function runDeploymentList(options) {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    const rootDir = sdk.workspace.root;
    const deployments = await listDeployments(rootDir, options.network);
    const filtered = options.status
        ? deployments.filter((d) => d.status === options.status)
        : deployments;
    if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
    }
    if (filtered.length === 0) {
        UI.info("No deployments found.");
        return;
    }
    UI.header("Deployments");
    // Group by network
    const byNetwork = {};
    for (const d of filtered) {
        const net = d.networkId || "unknown";
        if (!byNetwork[net])
            byNetwork[net] = [];
        byNetwork[net].push(d);
    }
    let total = 0;
    for (const [net, items] of Object.entries(byNetwork)) {
        console.log(`\n  ${net}`);
        for (const d of items) {
            const statusIcon = d.status === "confirmed" ? "✅" : d.status === "failed" ? "❌" : "⏳";
            const txIdShort = d.txId ? d.txId.slice(0, 12) + "..." : "(none)";
            const ago = formatAgo(d.deployedAt);
            console.log(`    ${statusIcon} ${d.label.padEnd(20)} ${d.status.padEnd(10)} ${txIdShort.padEnd(16)} ${ago}`);
            total++;
        }
    }
    console.log(`\n  Total: ${total} deployments across ${Object.keys(byNetwork).length} networks`);
}
export async function listAllDeployments(opts) {
    const rootDir = opts.workspaceRoot;
    const deployments = await listDeployments(rootDir, opts.network);
    const filtered = opts.status
        ? deployments.filter((d) => d.status === opts.status)
        : deployments;
    if (opts.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
    }
    if (filtered.length === 0) {
        UI.info("No deployments found.");
        return;
    }
    UI.header("Deployments");
    // Group by network
    const byNetwork = {};
    for (const d of filtered) {
        const net = d.networkId || "unknown";
        if (!byNetwork[net])
            byNetwork[net] = [];
        byNetwork[net].push(d);
    }
    let total = 0;
    for (const [net, items] of Object.entries(byNetwork)) {
        console.log(`\n  ${net}`);
        for (const d of items) {
            const statusIcon = d.status === "confirmed" ? "✅" : d.status === "failed" ? "❌" : "⏳";
            const txIdShort = d.txId ? d.txId.slice(0, 12) + "..." : "(none)";
            const ago = formatAgo(d.deployedAt);
            console.log(`    ${statusIcon} ${d.label.padEnd(20)} ${d.status.padEnd(10)} ${txIdShort.padEnd(16)} ${ago}`);
            total++;
        }
    }
    console.log(`\n  Total: ${total} deployments across ${Object.keys(byNetwork).length} networks`);
}
export async function inspectDeployment(opts) {
    const rootDir = opts.workspaceRoot;
    const record = await loadDeployment(rootDir, opts.network, opts.label);
    if (!record) {
        throw new Error(`Deployment '${opts.label}' not found on network '${opts.network}'.`);
    }
    if (opts.json) {
        console.log(JSON.stringify(record, null, 2));
        return;
    }
    UI.header(`Deployment: ${record.label}`);
    console.log(`  Network:        ${record.networkId}`);
    console.log(`  Status:         ${record.status}`);
    console.log(`  TxId:           ${record.txId || "(none)"}`);
    console.log(`  Plan artifact:  ${record.planArtifactId || "(none)"}`);
    console.log(`  Receipt:        ${record.receiptArtifactId || "(none)"}`);
    console.log(`  Deployed at:    ${record.deployedAt}`);
    console.log(`  Content hash:   ${record.contentHash}`);
    if (record.notes)
        console.log(`  Notes:          ${record.notes}`);
}
export async function verifyDeploymentStatus(opts) {
    const rootDir = opts.workspaceRoot;
    const record = await loadDeployment(rootDir, opts.network, opts.label);
    if (!record) {
        throw new Error(`Deployment '${opts.label}' not found on network '${opts.network}'.`);
    }
    if (!opts.verify) {
        if (opts.json)
            console.log(JSON.stringify({ label: record.label, status: record.status }, null, 2));
        else
            console.log(`Current status: ${record.status}`);
        return;
    }
    if (!record.txId) {
        throw new Error(`Cannot verify deployment '${opts.label}' without a transaction ID.`);
    }
    UI.info(`Checking ${record.label} on ${record.networkId}...`);
    const { config } = await loadHardkasConfig();
    const netTarget = resolveNetworkTarget({ config, network: record.networkId });
    const netTargetObj = netTarget.target;
    const rpcUrl = typeof netTargetObj.rpcUrl === "string" ? netTargetObj.rpcUrl : undefined;
    console.log(`  RPC: ${rpcUrl || "simulated"}`);
    console.log(`  TxId: ${record.txId}`);
    if (record.networkId === "simnet") {
        UI.info("  Simnet deployment — status preserved.");
    }
    else if (!rpcUrl) {
        UI.error("  No RPC URL configured for this network.");
    }
    else {
        try {
            const client = new JsonWrpcKaspaClient({ rpcUrl: rpcUrl });
            const tx = (await client.getTransaction(record.txId));
            let newStatus = record.status;
            if (tx) {
                const txTransaction = typeof tx.transaction === "object" && tx.transaction !== null
                    ? tx.transaction
                    : undefined;
                const isAccepted = tx.isAccepted === true ||
                    (txTransaction && typeof txTransaction.block_hash === "string");
                if (isAccepted)
                    newStatus = "confirmed";
            }
            else {
                // If not found, maybe it's still pending or failed.
                // We'll keep it as is unless we know for sure it failed.
            }
            if (newStatus !== record.status) {
                await withLock({ rootDir, name: "artifacts", command: "hardkas deploy status" }, async () => {
                    const updated = updateDeploymentStatus(record, newStatus);
                    await saveDeployment(rootDir, updated);
                    UI.success(`  Status updated: ${newStatus}`);
                });
            }
            else {
                UI.info(`  Status remains: ${record.status}`);
            }
            await client.close();
        }
        catch (e) {
            UI.error(`  RPC check failed: ${e.message}`);
        }
    }
}
export async function showDeploymentHistory(opts) {
    const options = {
        ...(opts.json !== undefined ? { json: opts.json } : {}),
        workspaceRoot: opts.workspaceRoot
    };
    await listAllDeployments(options);
}
function formatAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)
        return "just now";
    if (diffMin < 60)
        return `${diffMin} min ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24)
        return `${diffHour} hours ago`;
    return `${Math.floor(diffHour / 24)} days ago`;
}
//# sourceMappingURL=deployment-runners.js.map