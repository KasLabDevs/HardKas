import { Command } from "commander";
import { UI } from "../ui.js";
import { startConsole } from "../runners/console-runner.js";

export function registerConsoleCommand(program: Command): void {
  program
    .command("console")
    .description(`Open an interactive REPL with HardKAS SDK pre-loaded ${UI.maturity("stable")}`)
    .option("--network <name>", "Network name", "simnet")
    .option("--accounts <n>", "Number of simulated accounts", "3")
    .option("--balance <sompi>", "Initial balance per account in sompi", "100000000000")
    .action(async (opts) => {
      await startConsole({
        network: opts.network,
        accounts: parseInt(opts.accounts, 10),
        balance: BigInt(opts.balance)
      });
    });
}
