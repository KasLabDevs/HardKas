import { Command } from "commander";

export function registerVprogsCommands(program: Command) {
  const vprogs = program
    .command("vprogs")
    .description("vProgs inspect-only builder surface");

  vprogs
    .command("capabilities")
    .description("Show vProgs inspect capabilities")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const { createVprogsCapabilities } = await import("@hardkas/sdk");
      const result = createVprogsCapabilities();
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });

  vprogs
    .command("status")
    .description("Show vProgs inspect status")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const { createVprogsStatus } = await import("@hardkas/sdk");
      const result = createVprogsStatus();
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });

  vprogs
    .command("inspect <artifact>")
    .description("Inspect a local vProgs artifact without runtime claims")
    .option("--json", "Output as JSON", false)
    .action(async (artifact: string, options) => {
      const { inspectVprogsArtifact } = await import("@hardkas/sdk");
      const result = await inspectVprogsArtifact(artifact, process.cwd());
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });
}

function printResult(result: unknown, json?: boolean) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}
