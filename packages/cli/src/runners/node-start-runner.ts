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
    "Kaspa node started",
    "",
    "Backend:   Docker",
    `Image:     ${status.image}`,
    `Container: ${status.containerName}`,
    `Network:   ${status.network}`,
    `Status:    ${status.running ? "running" : "stopped"}`,
    "",
    "RPC:",
    `  gRPC:     127.0.0.1:${status.ports.rpc}`,
    `  Borsh:    127.0.0.1:${status.ports.borshRpc}`,
    `  JSON RPC: 127.0.0.1:${status.ports.jsonRpc}`,
    "",
    "Data:",
    `  ${status.dataDir}`
  ];

  return {
    status,
    formatted: lines.join("\n")
  };
}
