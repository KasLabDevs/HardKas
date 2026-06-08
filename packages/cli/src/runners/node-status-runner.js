import { DockerKaspadRunner } from "@hardkas/node-runner";
export async function runNodeStatus(input) {
    const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
    const status = await runner.status();
    const lines = [
        "Kaspa node status",
        "",
        `Backend:   Docker`,
        `Status:    ${status.running ? "✓ running" : "✗ stopped"}`,
        "",
        "RPC Readiness:",
        `  gRPC:     ${status.transports.grpc.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.rpc})`,
        `  Borsh:    ${status.transports.borsh.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.borshRpc})`,
        `  JSON RPC: ${status.transports.json.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.jsonRpc})`,
        "",
        "Node Information:",
        `  Container: ${status.containerName}`,
        `  Image:     ${status.image}`,
        `  Network:   ${status.network}`,
        `  Data Dir:  ${status.dataDir}`
    ];
    if (status.lastError && !status.rpcReady) {
        lines.push("", "Last Error:", `  ${status.lastError}`);
    }
    return {
        status,
        formatted: lines.join("\n")
    };
}
//# sourceMappingURL=node-status-runner.js.map