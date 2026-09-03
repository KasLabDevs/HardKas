import { Command } from "commander";
import { UI } from "../ui.js";
import { runSimulatorAccountCreate } from "../runners/simulator-runners.js";
import { runAccountsFund } from "../runners/accounts-fund-runner.js";

export function registerSimulatorCommands(program: Command) {
  const simulatorCmd = program
    .command("simulator")
    .description("HardKAS Simulator management");

  const accountCmd = simulatorCmd.command("account").description("Manage synthetic simulated accounts");
  
  accountCmd
    .command("create <name>")
    .description(`Create a synthetic simulated account ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: any) => {
      const { withLock } = await import("@hardkas/core");
      try {
        await withLock(
          {
            rootDir: process.cwd(),
            name: "simulator",
            command: `hardkas simulator account create ${name}`,
            wait: false,
            timeoutMs: 30000
          },
          async () => {
            await runSimulatorAccountCreate(name, options);
          }
        );
      } catch (e) {
        throw e;
      }
    });

  simulatorCmd
    .command("fund <identifier>")
    .description(`Fund a synthetic simulated account ${UI.maturity("stable")}`)
    .option("--amount <kas>", "Amount in KAS to fund", "1000")
    .option("--json", "Output as JSON", false)
    .action(async (identifier: string, options: any) => {
      try {
        // Enforce synthetic constraint before proceeding
        const { loadHardkasConfig } = await import("@hardkas/config");
        const { config } = await loadHardkasConfig({});
        const { resolveHardkasAccount } = await import("@hardkas/accounts");
        
        const target = { mode: "simulator", domain: "kaspa-l1", network: "simnet" } as const;

        let account;
        try {
          account = resolveHardkasAccount({ nameOrAddress: identifier, config, executionTarget: target });
        } catch {
          // If it fails to resolve, let accounts fund logic handle it,
          // but we can enforce kaspa:sim_ prefix here
        }

        if (account) {
          const { assertExecutionCompatibility } = await import("@hardkas/core");
          assertExecutionCompatibility({
            operation: "fund",
            target,
            account
          });
        }

        const amountSompi = BigInt(parseFloat(options.amount) * 100_000_000);
        
        // Reusing accounts fund logic which is already synthetic
        const result = await runAccountsFund({ identifier, amountSompi });
        
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "simulator fund", result: result.success ? "success" : "failed" });
        } else {
          const { getOutput } = await import("../output.js");
          getOutput().writeLine(result.formatted);
        }
      } catch (e) {
        throw e;
      }
    });
}
