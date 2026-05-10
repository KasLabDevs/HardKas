import { DockerKaspadRunner, KaspadNodeStatus } from "@hardkas/node-runner";

export interface NodeStopRunnerInput {
  containerName?: string;
}

export async function runNodeStop(input: NodeStopRunnerInput): Promise<KaspadNodeStatus> {
  const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
  return runner.stop();
}
