import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerInspectCommand(pskt: Command) {
  pskt
    .command("inspect <sessionPath>")
    .description(
      `Show a PSKT session file's metadata. It does not decode the payload: no inputs, outputs, amounts or recipients, so it is no pre-signing check ${UI.maturity("alpha")}`
    )
    .option("--json", "Output results as JSON", false)
    .action(async (sessionPath: string, options: any) => {
      const { runPsktInspect } = await import("../../runners/pskt/inspect.js");
      await runPsktInspect(sessionPath, options);
    });
}
