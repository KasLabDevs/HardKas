import { Command } from "commander";
import { getOutput } from "../output.js";

export function registerVprogsCommands(program: Command) {
  const vprogs = program
    .command("vprogs")
    .description("vProgs inspect-only builder surface (Outputs JSON by default)");

  vprogs
    .command("capabilities")
    .description("Show vProgs inspect capabilities")
    .option("--json", "Output as JSON", false)
    .action(async () => {
      const { createVprogsCapabilities } = await import("@hardkas/sdk");
      const result = createVprogsCapabilities();
      printResult(result);
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("VPROGS_CAPABILITIES_FAILED", "Failed", {
          exitCode: 1
        });
      }
    });

  vprogs
    .command("status")
    .description("Show vProgs inspect status")
    .option("--json", "Output as JSON", false)
    .action(async () => {
      const { createVprogsStatus } = await import("@hardkas/sdk");
      const result = createVprogsStatus();
      printResult(result);
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("VPROGS_STATUS_FAILED", "Failed", { exitCode: 1 });
      }
    });

  vprogs
    .command("inspect <artifact>")
    .description("Inspect a local vProgs artifact without runtime claims")
    .option("--json", "Output as JSON", false)
    .action(async (artifact: string) => {
      const { inspectVprogsArtifact } = await import("@hardkas/sdk");
      const result = await inspectVprogsArtifact(artifact, process.cwd());
      printResult(result);
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("VPROGS_INSPECT_FAILED", "Failed", { exitCode: 1 });
      }
    });
}

function printResult(result: unknown) {
  getOutput().writeJson(result);
}
