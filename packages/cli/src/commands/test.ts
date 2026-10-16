import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runTest } from "../runners/test-runner.js";

export function registerTestCommands(program: Command) {
  program
    .command("test [files...]")
    .description(`Run the project's tests with Vitest and the HardKAS test helpers ${UI.maturity("stable")}`)
    .option("--network <network>", "The network the scenarios run on: the workspace's network (default); a different one is refused")
    .option("--watch", "Passed to Vitest, but the CLI exits after the first run (watch does not persist)", false)
    .option("--mass-report", "No effect in this release", false)
    .option("--mass-snapshot <label>", "No effect in this release")
    .option("--mass-compare <label>", "No effect in this release")
    .option("--json", "Output results as JSON", false)
    .option("--keep-runs", "Keep temporary scenario workspaces for debugging", false)
    .option("--evidence", "Automatically package evidence into .hke.json", false)
    .option("--scenario <name>", "Only run tests whose full name matches this regular expression")
    .action(
      async (
        files: string[],
        options: {
          network?: string;
          watch: boolean;
          json: boolean;
          reporter: string;
          massReport: boolean;
          massSnapshot?: string;
          massCompare?: string;
          keepRuns: boolean;
          evidence: boolean;
          scenario?: string;
        }
      ) => {
        try {
          // HARDKAS-NETWORK-PORTABILITY-1: the scenarios run on the workspace's network (the SDK they open reads it); the
          // network recorded and announced is that one. A --network that names another used to be recorded as if the
          // tests had run there (default "simnet" whatever the workspace): refused before anything runs.
          const network = await workspaceTestNetwork();
          if (options.network !== undefined && options.network !== network.name && options.network !== network.network) {
            const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
            throw new HardkasCliError(
              "TEST_NETWORK_MISMATCH",
              `--network ${options.network} is not the network the scenarios run on (${network.name}, this workspace's network). ` +
                `Set the workspace's execution default to it, or omit --network. Nothing ran.`,
              { exitCode: HardkasExitCode.USAGE_ERROR }
            );
          }
          await runTest({
            files,
            workspaceRoot: process.cwd(),
            network: network.name,
            watch: options.watch,
            json: options.json,
            reporter: options.reporter,
            massReport: options.massReport,
            keepRuns: options.keepRuns,
            evidence: options.evidence,
            ...(options.scenario ? { scenario: options.scenario } : {}),
            ...(options.massSnapshot ? { massSnapshot: options.massSnapshot } : {}),
            ...(options.massCompare ? { massCompare: options.massCompare } : {})
          });
        } catch (e) {
          // CLI-RUNTIME-CONTRACT-1: rendered once here, rethrown as itself (code and context kept).
          handleError(e, "Test execution failed");
          throw e;
        }
      }
    );
}

/** The network this workspace's scenarios run on: its execution default, else the legacy `defaultNetwork` mirror. */
async function workspaceTestNetwork(): Promise<{ name: string; network: string }> {
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    const { config } = await loadHardkasConfig({ workspaceRoot: process.cwd() });
    const exec: any = (config as any).execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    const name: string = typeof target?.network === "string" ? target.network : String((config as any).defaultNetwork ?? "simulated");
    const entry = (config.networks as any)?.[name] as { network?: unknown } | undefined;
    return { name, network: typeof entry?.network === "string" ? entry.network : name };
  } catch {
    return { name: "simulated", network: "simulated" };
  }
}