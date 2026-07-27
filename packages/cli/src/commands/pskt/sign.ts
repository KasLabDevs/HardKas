import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerSignCommand(pskt: Command) {
  pskt
    .command("sign <sessionPath>")
    .description(`Sign a PSKT session payload ${UI.maturity("alpha")}`)
    .option("--account <name>", "Name of the HardKAS L1 account to sign with")
    .option("--keystore <path>", "Path to a HardKAS keystore JSON file")
    .option("--key-stdin", "Read private key from standard input")
    .option("--private-key-file <path>", "Path to file containing raw private key (TEST ONLY)")
    .requiredOption("--out <outputPath>", "Path to write the updated PSKT session JSON")
    .option("--force", "Overwrite the output file if it exists", false)
    .option("--json", "Output results as JSON", false)
    .action(async (sessionPath: string, options: any) => {
      const { runPsktSign } = await import("../../runners/pskt/mutating.js");
      await runPsktSign(sessionPath, options);
    });
}
