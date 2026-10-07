import { Command } from "commander";
import { UI } from "../ui.js";
import { explicitWorkspaceOrCwd } from "../workspace-root.js";

export function registerReplayCommands(program: Command) {
  const replayCmd = program
    .command("replay")
    .description("Manage HardKAS transaction replays");

  replayCmd
    .command("verify [artifact]")
    .description(
      `Verify deterministic simulator-mode replay for a receipt (required) by exact artifactId or a workspace path such as ./receipt.json. Real-node sends are not supported: they record a TxSubmission, not a TxReceipt. ${UI.maturity("stable")}`
    )
    .option("--json", "Output as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string | undefined, options: any) => {
      // Wave 8 · DEF-18: preserve typed error identity. The previous
      // `throw new Error("Command failed")` collapsed HardkasCliError into
      // a generic Error, which the top-level renderer then serialized as
      // `code: "UNKNOWN_ERROR"` — losing the specific replay classification
      // (REPLAY_MODE_UNSUPPORTED, REPLAY_DIVERGED, etc.). Letting the
      // typed error propagate makes the top-level renderer the single
      // owner of the final failure envelope.
      const { runReplayVerify } = await import("../runners/replay-verify-runner.js");
      const workspaceRoot = explicitWorkspaceOrCwd(); // --workspace is resolved once (WORKSPACE-AUTHORITY-1)
      await runReplayVerify({ path: targetPath || "", ...options, workspaceRoot });
    });
  replayCmd
    .command("diff <idA> <idB>")
    .description(
      `Compare two replay artifacts for deterministic divergence ${UI.maturity("alpha")}`
    )
    .option("--json", "Output as JSON", false)
    .action(async (idA: string, idB: string, options: { json: boolean }) => {
      // CLI-RUNTIME-CONTRACT-1: the runner's own error (and its code) reaches the top-level renderer
      // unchanged; the former `throw new Error("Command failed")` destroyed it.
      const { runReplayDiff } = await import("../runners/replay-diff-runner.js");
      await runReplayDiff({
        idA,
        idB,
        ...options,
        network: "simnet",
        workspaceRoot: process.cwd()
      });
    });
}
