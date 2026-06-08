import { DockerKaspadRunner } from "@hardkas/node-runner";
export async function runNodeReset(input) {
    const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
    const status = await runner.reset({ removeData: input.removeData !== false });
    return {
        status,
        formatted: `Kaspa node reset complete. Data removed: ${input.removeData !== false}. Node is currently ${status.running ? "running" : "stopped"}.`
    };
}
//# sourceMappingURL=node-reset-runner.js.map