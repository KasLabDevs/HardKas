import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { loadOrCreateLocalnetState } from "@hardkas/localnet";
import { runExampleList } from "../runners/example-list-runner.js";
import { runExampleRun } from "../runners/example-run-runner.js";

export function registerMiscCommands(program: Command) {
  // --- Example Commands ---
  const exampleCmd = program.command("example").description("Manage HardKAS examples");

  exampleCmd.command("list")
    .description("List available HardKAS examples")
    .action(async () => {
      try {
        await runExampleList();
      } catch (e) {
        handleError(e, "Failed to list examples");
        process.exitCode = 1;
      }
    });

  exampleCmd.command("run <id>")
    .description("Run a HardKAS example")
    .action(async (id: string) => {
      try {
        await runExampleRun(id);
      } catch (e) {
        handleError(e, `Failed to run example '${id}'`);
        process.exitCode = 1;
      }
    });

}
