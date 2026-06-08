import { DockerKaspadRunner } from "@hardkas/node-runner";
export async function runNodeStop(input) {
    const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
    return runner.stop();
}
//# sourceMappingURL=node-stop-runner.js.map