import { DockerKaspadRunner, KaspadNodeStatus } from "@hardkas/node-runner";

export interface NodeRestartRunnerInput {
  containerName?: string;
  image?: string;
}

export interface NodeRestartRunnerResult {
  status: KaspadNodeStatus;
  formatted: string;
}

export async function runNodeRestart(input: NodeRestartRunnerInput): Promise<NodeRestartRunnerResult> {
  const runner = new DockerKaspadRunner({
    ...(input.containerName ? { containerName: input.containerName } : {}),
    ...(input.image ? { image: input.image } : {})
  });
  const status = await runner.restart();

  return {
    status,
    formatted: `Kaspa node restarted (Container: ${status.containerName})`
  };
}
