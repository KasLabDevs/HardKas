import { DockerKaspadRunner, KaspadNodeStatus } from "@hardkas/node-runner";

export interface NodeResetRunnerInput {
  containerName?: string;
  removeData?: boolean;
  /** The workspace root whose `.hardkas/kaspad` is the node's data (AUD-24). */
  cwd?: string;
}

export interface NodeResetRunnerResult {
  status: KaspadNodeStatus;
  formatted: string;
}

export async function runNodeReset(
  input: NodeResetRunnerInput
): Promise<NodeResetRunnerResult> {
  const runner = new DockerKaspadRunner({
    ...(input.containerName ? { containerName: input.containerName } : {}),
    ...(input.cwd ? { cwd: input.cwd } : {})
  });
  const status = await runner.reset({ removeData: input.removeData !== false });

  return {
    status,
    formatted: `Kaspa node reset complete. Data removed: ${input.removeData !== false}. Node is currently ${status.running ? "running" : "stopped"}.`
  };
}
