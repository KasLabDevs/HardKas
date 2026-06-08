import { UI } from "../ui.js";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { HardkasFixtureSigner } from "@hardkas/accounts";
export async function runDoctorNode(opts) {
    if (opts.json)
        UI.setJsonMode(true);
    if (!opts.json) {
        UI.box("HardKAS Doctor", "Real Node Diagnostics (Phase 9)");
    }
    if (opts.capabilities) {
        return await runCapabilitiesReport();
    }
    // 1. Node check
    const runner = new DockerKaspadRunner();
    const status = await runner.status();
    if (status.running) {
        UI.logHuman(`  ✅ Node: READY (${status.containerName})`);
    }
    else {
        UI.logHuman(`  ❌ Node: NOT RUNNING`);
        process.exit(1);
    }
    // 2. RPC check
    if (status.rpcReady) {
        UI.logHuman(`  ✅ RPC: READY (127.0.0.1:18210)`);
    }
    else {
        UI.logHuman(`  ❌ RPC: NOT READY`);
        process.exit(1);
    }
    // 3. Signer check
    try {
        const signer = new HardkasFixtureSigner("simnet");
        await signer.getAddress();
        UI.logHuman(`  ✅ Signer: kaspa-wasm READY`);
    }
    catch (err) {
        UI.logHuman(`  ❌ Signer: UNAVAILABLE (${err.message})`);
    }
    // 4. Mining check (CHAIN_ADVANCING)
    let client = null;
    try {
        client = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
        const info1 = await client.getBlockDagInfo();
        const score1 = info1.virtualDaaScore || 0n;
        await new Promise(r => setTimeout(r, 2000));
        const info2 = await client.getBlockDagInfo();
        const score2 = info2.virtualDaaScore || 0n;
        if (score2 > score1) {
            UI.logHuman(`  ✅ Miner: CHAIN_ADVANCING (DAA Score: ${score1} -> ${score2})`);
        }
        else {
            UI.logHuman(`  ❌ Miner: INACTIVE (DAA Score stalled at ${score1})`);
        }
    }
    catch (err) {
        UI.logHuman(`  ❌ Miner: UNAVAILABLE (${err.message})`);
    }
    finally {
        if (client)
            await client.close();
    }
    // 5. Fixture balance check
    try {
        const signer = new HardkasFixtureSigner("simnet");
        const address = await signer.getAddress();
        const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
        const utxos = await client.getUtxosByAddress(address);
        const balanceRes = await client.getBalanceByAddress(address);
        const balance = balanceRes?.balanceSompi || 0n;
        if (balance > 0n) {
            UI.logHuman(`  ✅ Fixture balance: > 0 (${Number(balance) / 100000000} KAS, ${utxos.length} UTXOs)`);
        }
        else {
            UI.logHuman(`  ❌ Fixture balance: 0 KAS`);
        }
        await client.close();
    }
    catch (err) {
        UI.logHuman(`  ❌ Fixture balance: ERROR (${err.message})`);
    }
}
async function runCapabilitiesReport() {
    const report = {
        nodeVersion: "unknown",
        network: "unknown",
        rpc: "unavailable",
        daaAdvancing: false,
        scriptCapabilities: "unknown"
    };
    let client = null;
    // Try port 16210 first (TN12), then 18210 (simnet)
    const ports = [16210, 18210];
    let connected = false;
    for (const port of ports) {
        try {
            client = new JsonWrpcKaspaClient({ rpcUrl: `ws://127.0.0.1:${port}` });
            // If we can get block dag info, we are connected
            const info1 = await client.getBlockDagInfo();
            connected = true;
            report.rpc = "ready";
            report.network = info1.networkName || info1.networkId || "unknown";
            try {
                const serverInfo = await client.getServerInfo();
                report.nodeVersion = serverInfo.serverVersion || "unknown";
            }
            catch (e) {
                // Ignored, maybe unsupported
            }
            const score1 = info1.virtualDaaScore || 0n;
            await new Promise(r => setTimeout(r, 2000));
            const info2 = await client.getBlockDagInfo();
            const score2 = info2.virtualDaaScore || 0n;
            if (score2 > score1) {
                report.daaAdvancing = true;
            }
            break;
        }
        catch (e) {
            if (client) {
                await client.close().catch(() => { });
                client = null;
            }
        }
    }
    if (client) {
        await client.close().catch(() => { });
    }
    // Ensure JSON output as requested
    console.log(JSON.stringify(report, null, 2));
}
//# sourceMappingURL=doctor-node-runner.js.map