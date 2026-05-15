import { DockerKaspadRunner, DockerKaspadOptions, KaspadNodeStatus } from "@hardkas/node-runner";

export interface NodeStartRunnerInput extends DockerKaspadOptions {
  json?: boolean;
}

export interface NodeStartRunnerResult {
  status: KaspadNodeStatus;
  formatted: string;
}

export async function runNodeStart(input: NodeStartRunnerInput): Promise<NodeStartRunnerResult> {
  const runner = new DockerKaspadRunner(input);
  const status = await runner.start();

  const lines = [
    "Kaspa node started successfully",
    "",
    `Backend:   Docker`,
    `Image:     ${status.image}`,
    `Container: ${status.containerName}`,
    `Status:    ✓ running`,
    "",
    "RPC Readiness:",
    `  gRPC:     ${status.transports.grpc.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.rpc})`,
    `  Borsh:    ${status.transports.borsh.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.borshRpc})`,
    `  JSON RPC: ${status.transports.json.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.jsonRpc})`,
    "",
    "Data Directory:",
    `  ${status.dataDir}`
  ];

  return {
    status,
    formatted: lines.join("\n")
  };
}
