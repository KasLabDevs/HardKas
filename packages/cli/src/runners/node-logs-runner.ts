import { DockerKaspadRunner } from "@hardkas/node-runner";

export interface NodeLogsRunnerInput {
  containerName?: string;
  tail?: number;
}

export async function runNodeLogs(input: NodeLogsRunnerInput): Promise<string> {
  const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
  return (await runner.logs(input.tail ? { tail: input.tail } : {})) ?? "";
}
