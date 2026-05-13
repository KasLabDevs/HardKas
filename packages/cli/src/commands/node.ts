import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { runNodeStart } from "../runners/node-start-runner.js";
import { runNodeStatus } from "../runners/node-status-runner.js";
import { runNodeStop } from "../runners/node-stop-runner.js";
import { runNodeRestart } from "../runners/node-restart-runner.js";
import { runNodeReset } from "../runners/node-reset-runner.js";
import { runNodeLogs } from "../runners/node-logs-runner.js";

export function registerNodeCommands(program: Command) {
  const nodeCmd = program.command("node").description("Kaspa node management (Docker)");

  nodeCmd.command("start")
    .description(`Start local node ${UI.maturity("stable")}`)
    .option("--image <image>", "Docker image")
    .action(async (options) => {
      try {
        const result = await runNodeStart(options);
        console.log(result.formatted);
      } catch (e) {
        handleError(e);
      }
    });

  nodeCmd.command("stop")
    .description(`Stop local node ${UI.maturity("stable")}`)
    .action(async () => {
      try {
        const result = await runNodeStop({});
        UI.success(`Node stopped (Container: ${result.containerName})`);
      } catch (e) {
        handleError(e);
      }
    });

  nodeCmd.command("restart")
    .description(`Restart local node ${UI.maturity("stable")}`)
    .action(async () => {
      try {
        const result = await runNodeRestart({});
        console.log(result.formatted);
      } catch (e) {
        handleError(e);
      }
    });

  nodeCmd.command("reset")
    .description(`Stop node and remove all local chain data ${UI.maturity("preview")}`)
    .option("--start", "Restart the node after reset", false)
    .option("--yes", "Skip confirmation prompt", false)
    .action(async (options) => {
      try {
        if (!options.yes) {
          const confirmed = await UI.confirm("This will delete all local chain data. Are you sure?");
          if (!confirmed) {
            console.log("  Aborted.");
            return;
          }
        }
        
        const result = await runNodeReset({ removeData: true });
        UI.success(result.formatted);
        
        if (options.start) {
          UI.info("Starting node...");
          const startResult = await runNodeStart({});
          console.log(startResult.formatted);
        }
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

  nodeCmd.command("logs")
    .description(`View node logs ${UI.maturity("preview")}`)
    .option("--tail <n>", "Number of lines to show", "100")
    .option("--follow", "Follow log output", false)
    .action(async (options) => {
      try {
        const result = await runNodeLogs({
          tail: parseInt(options.tail, 10)
        });
        if (result) console.log(result);
      } catch (e) {
        handleError(e);
      }
    });
}
