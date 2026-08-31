import { DockerKaspadRunner } from "@hardkas/node-runner";
export async function runNodeRestart(input) {
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
//# sourceMappingURL=node-restart-runner.js.map