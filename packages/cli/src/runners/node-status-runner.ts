import { DockerKaspadRunner, KaspadNodeStatus } from "@hardkas/node-runner";

export interface NodeStatusRunnerInput {
  containerName?: string;
}

export interface NodeStatusRunnerResult {
  status: KaspadNodeStatus;
  formatted: string;
}

export async function runNodeStatus(input: NodeStatusRunnerInput): Promise<NodeStatusRunnerResult> {
  const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
  const status = await runner.status();

  const lines = [
    "Kaspa node status",
    "",
    "Backend:   Docker",
    `Container: ${status.containerName}`,
    `Network:   ${status.network}`,
    `Status:    ${status.running ? "running" : "stopped"}`,
    "",
    "RPC:",
    `  gRPC:     127.0.0.1:${status.ports.rpc}`,
    `  Borsh:    127.0.0.1:${status.ports.borshRpc}`,
    `  JSON RPC: 127.0.0.1:${status.ports.jsonRpc}`
  ];

  return {
    status,
    formatted: lines.join("\n")
  };
}
