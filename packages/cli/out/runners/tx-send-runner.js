import { assertBroadcastNetworkAllowed } from "../broadcast-guard.js";
import { Hardkas } from "@hardkas/sdk";
/**
 * CLI Runner for transaction broadcasting.
 * Delegates core logic to the HardKAS SDK.
 */
export async function runTxSend(input) {
    const { targetName, signedArtifact, network, config, url } = input;
    const { resolveExecutionTarget } = await import("@hardkas/config");
    let resolvedName;
    let execution;
    let target;
    if (targetName) {
        const res = resolveExecutionTarget({ config, targetName });
        resolvedName = res.name;
        execution = res.execution;
        target = res.target;
    }
    else if (signedArtifact.execution) {
        const targets = (config.execution && "targets" in config.execution) ? config.execution.targets : {};
        const matchingTarget = Object.entries(targets).find(([_, t]) => {
            const e = signedArtifact.execution;
            const typedT = t;
            return typedT.domain === e.domain && typedT.mode === e.mode && typedT.network === e.network;
        });
        if (matchingTarget) {
            resolvedName = matchingTarget[0];
            execution = signedArtifact.execution;
            target = matchingTarget[1];
        }
        else {
            resolvedName = signedArtifact.networkId || "artifact_execution";
            execution = signedArtifact.execution;
            target = {};
        }
    }
    else if (config.execution && "default" in config.execution && config.execution.default) {
        const res = resolveExecutionTarget({ config }); // Uses defaultNetwork internally
        resolvedName = res.name;
        execution = res.execution;
        target = res.target;
    }
    else {
        throw new Error("EXECUTION_NETWORK_MISMATCH: No target specified, artifact lacks execution metadata, and no default target found in config.");
    }
    if (network && execution.network !== network) {
        throw new Error(`EXECUTION_NETWORK_MISMATCH: Target specifies network '${execution.network}', but command was called with legacy --network '${network}'.`);
    }
    const networkName = execution.network;
    const { resolveProvider } = await import("@hardkas/config");
    const provider = resolveProvider({
        network: resolvedName,
        provider: input.provider,
        url,
        executionMode: execution.mode
    });
    // ENFORCE EXECUTION COMPATIBILITY FOR BROADCASTING/SIMULATION
    const { assertExecutionCompatibility } = await import("@hardkas/core");
    assertExecutionCompatibility({
        operation: provider.mode === "simulator" ? "simulate" : "send",
        target: execution,
        artifact: { execution: signedArtifact.execution }
    });
    // Initialize the SDK
    const sdk = await Hardkas.open({ cwd: input.workspaceRoot || process.cwd() });
    sdk.config.config.defaultNetwork = resolvedName;
    // 1. Simulated Mode
    if (provider.mode === "simulator" && signedArtifact.mode !== "real") {
        const { receipt, receiptPath } = await sdk.tx.simulate(signedArtifact);
        return {
            accepted: true,
            txId: receipt.txId,
            rpcUrl: url || "simulated://local",
            networkName: resolvedName,
            receipt,
            receiptPath,
            executionId: `exec_${Date.now().toString(36)}`,
            replayId: `replay_${receipt.txId.substring(0, 8)}`
        };
    }
    // 2. Real Mode (Node/RPC)
    assertBroadcastNetworkAllowed({
        artifactNetworkId: signedArtifact.networkId,
        selectedNetwork: networkName
    });
    const targetRecord = target;
    const targetRpcUrl = typeof targetRecord["rpcUrl"] === "string" ? targetRecord["rpcUrl"] : undefined;
    const rpcUrl = url || targetRpcUrl || provider.endpoint;
    if (!rpcUrl)
        throw new Error(`No RPC URL found for network '${networkName}'.`);
    // Override the SDK RPC client for real mode since default simnet creates a simulated provider
    const { JsonWrpcKaspaClient, KaspaWrpcClient } = await import("@hardkas/kaspa-rpc");
    const isWebSocket = rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://");
    const rpcClient = isWebSocket
        ? new KaspaWrpcClient(rpcUrl)
        : new JsonWrpcKaspaClient({ rpcUrl: rpcUrl });
    if (isWebSocket) {
        await rpcClient.connect();
    }
    sdk.rpc = rpcClient;
    try {
        const { receipt, receiptPath } = await sdk.tx.send(signedArtifact, rpcUrl);
        return {
            accepted: receipt.status === "submitted" || receipt.status === "confirmed",
            txId: receipt.txId,
            rpcUrl,
            networkName: resolvedName,
            receipt,
            receiptPath,
            executionId: `exec_${Date.now().toString(36)}`,
            replayId: `replay_${receipt.txId.substring(0, 8)}`
        };
    }
    finally {
        if (rpcClient) {
            if ("disconnect" in rpcClient && typeof rpcClient.disconnect === "function") {
                await rpcClient.disconnect();
            }
            else if ("close" in rpcClient && typeof rpcClient.close === "function") {
                await rpcClient.close();
            }
        }
    }
}
//# sourceMappingURL=tx-send-runner.js.map