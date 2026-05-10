import { Command } from "commander";
import { handleError } from "../ui.js";
import { runNodeStart } from "../runners/node-start-runner.js";
import { runNodeStatus } from "../runners/node-status-runner.js";

export function registerNodeCommands(program: Command) {
  const nodeCmd = program.command("node").description("Kaspa node management (Docker)");

  nodeCmd.command("start")
    .description("Start local node")
    .option("--image <image>", "Docker image")
    .action(async (options) => {
      try {
        const result = await runNodeStart(options);
        console.log(result.formatted);
      } catch (e) {
        handleError(e);
      }
    });

  nodeCmd.command("status")
    .description("Check node status")
    .action(async () => {
      try {
        const result = await runNodeStatus({});
        console.log(result.formatted);
      } catch (e) {
        handleError(e);
      }
    });
}
