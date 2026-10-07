import { Command } from "commander";
import { explicitWorkspaceOrCwd } from "../workspace-root.js";

export function registerCorpusCommands(program: Command) {
  const corpus = program.command("corpus").description("Verify release fixture corpora");

  corpus
    .command("verify <path>")
    .description("Verify a HardKAS golden corpus")
    .option("--json", "Output results as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string, options: any) => {
      const { runCorpusVerify } = await import("../runners/corpus-verify-runner.js");
      const workspaceRoot = explicitWorkspaceOrCwd(); // --workspace is resolved once (WORKSPACE-AUTHORITY-1)
      await runCorpusVerify({
        path: targetPath,
        json: options.json,
        workspaceRoot
      });
    });
}
