import { DockerKaspadRunner } from "@hardkas/node-runner";
export async function runNodeLogs(input) {
    const runner = new DockerKaspadRunner(input.containerName ? { containerName: input.containerName } : {});
    return (await runner.logs(input.tail ? { tail: input.tail } : {})) ?? "";
}
//# sourceMappingURL=node-logs-runner.js.map