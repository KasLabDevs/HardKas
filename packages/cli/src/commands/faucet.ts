import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { runAccountsFund } from "../runners/accounts-fund-runner.js";

export function registerFaucetCommand(program: Command) {
  program.command("faucet <identifier>")
    .description(`Fund an account with KAS (Local only) ${UI.maturity("stable")}`)
    .option("--amount <kas>", "Amount in KAS to fund", "1000")
    .action(async (identifier: string, options: { amount: string }) => {
      try {
        const amountSompi = BigInt(parseFloat(options.amount) * 100_000_000);
        const result = await runAccountsFund({ identifier, amountSompi });
        console.log(result.formatted);
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
