import { Command } from "commander";
import { UI } from "../ui.js";
import { invocationWorkspace } from "../workspace-root.js";

// CLI-RUNTIME-CONTRACT-1: the runners' own errors (and their codes) reach the top-level renderer
// unchanged. The former `catch (e) { throw new Error("Dev … failed") }` wrappers destroyed them
// (a NOT_NODE_PROJECT became "Dev init failed" / UNKNOWN_ERROR).

export function registerDevCommands(program: Command) {
  const devCmd = program
    .command("dev")
    // SURFACE-TRUTH-1B (ST-D): the group is the L1 dev environment; Igra is a Lab, not "native" to it.
    .description("Local development tools: dev environment, dApp templates, simnet dev accounts (`dev doctor` is an Igra L2 lab check)")
    .option(
      "--once",
      "Initialize dev environment, run health checks, and exit (headless)",
      false
    )
    .option("--headless", "Run headlessly (no UI open)", false)
    .action(async (options: any) => {
      const { runDevEnv } = await import("../runners/dev-env-runner.js");
      await runDevEnv(options);
    });

  devCmd
    .command("create <name>")
    .description(`Create a new dApp project from a template ${UI.maturity("stable")}`)
    .action(async (name: string) => {
      const { runDevCreate } = await import("../runners/dev-create-runner.js");
      await runDevCreate(name);
    });

  devCmd
    .command("init")
    .description(
      `Initialize dApp support in the current workspace ${UI.maturity("stable")}`
    )
    .action(async () => {
      const { runDevInit } = await import("../runners/dev-init-runner.js");
      await runDevInit();
    });

  devCmd
    .command("doctor")
    // SURFACE-TRUTH-1B (ST-D): an Igra L2 lab check, not a stable L1 command.
    .description(`Igra L2 lab, not the L1 core: check local dev readiness for an L2 profile (Igra by default): workspace, artifacts, query store, SDK import, dev server and the L2 JSON-RPC; the Kaspa node is not checked ${UI.maturity("experimental")}`)
    .option("--profile <name>", "L2 network profile name", "igra")
    .option("--rpc-url <url>", "Explicit Igra RPC URL to check")
    .option("--account <name>", "EVM account that must exist in hardkas.config (its balance is not checked)")
    .option("--timeout <ms>", "RPC timeout in milliseconds", "3000")
    .option("--json", "Output as JSON")
    .option("--release", "Run strict release gate checks")
    .action(async (options: any) => {
      const { runDevDoctor } = await import("../runners/dev-doctor-runner.js");
      await runDevDoctor(options);
    });


  const accountsCmd = devCmd
    .command("accounts")
    .description("Manage simnet dev accounts");

  accountsCmd
    .command("list")
    .description("List dev accounts")
    .action(async () => {
      const { runDevAccountsList } = await import("../runners/dev-accounts-runners.js");
      await runDevAccountsList();
    });

  accountsCmd
    .command("reveal <alias>")
    .description("Reveal private key for a dev account (simnet only)")
    .action(async (alias: string) => {
      const { runDevAccountsReveal } = await import("../runners/dev-accounts-runners.js");
      await runDevAccountsReveal(alias);
    });

  accountsCmd
    .command("export <format>")
    .description("Export a dev account for a wallet's manual import; format: kasware")
    .option("--alias <alias>", "Alias to export", "alice")
    .action(async (format: string, options: any) => {
      // #8/#33: `.command("export kasware")` made "kasware" a positional the action received as its
      // options, so `--alias` was always undefined ("alias 'undefined' not found", exit 0).
      if (format !== "kasware") {
        const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
        throw new HardkasCliError("DEV_EXPORT_FORMAT_UNKNOWN", `Unknown export format '${format}': the only format is kasware`, {
          exitCode: HardkasExitCode.USAGE_ERROR
        });
      }
      const { runDevAccountsExport } = await import("../runners/dev-accounts-runners.js");
      await runDevAccountsExport(options.alias);
    });

  const txCmd = devCmd.command("tx").description("Quick transaction flows for dev");

  txCmd
    .command("send")
    .description("Quick send transaction")
    .option("--from <accountOrAddress>", "Sender alias")
    .option("--to <address>", "Recipient address")
    .option("--amount <kas>", "Amount in KAS")
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (options: any) => {
      // --workspace is resolved once (WORKSPACE-AUTHORITY-1); without it this command keeps its default directory
      const ws = invocationWorkspace();
      if (ws.explicit !== undefined) options.workspaceRoot = ws.root;
      const { runDevTxSend } = await import("../runners/dev-tx-runners.js");
      await runDevTxSend(options);
    });

  txCmd
    .command("generate")
    .description(`Generate simulated load/batch transactions ${UI.maturity("stable")}`)
    .requiredOption("--count <number>", "Number of transactions to generate")
    .option("--network <name>", "Network name", "simulated")
    .option("--workspace <path>", "Override workspace root directory")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      if (options.json) UI.setJsonMode(true);
      // --workspace is resolved once (WORKSPACE-AUTHORITY-1); without it this command keeps its default directory
      const ws = invocationWorkspace();
      if (ws.explicit !== undefined) options.workspace = ws.root;
      const { runDevTxGenerate } = await import("../runners/dev-tx-generate-runner.js");
      // the runner's own error (and its code) reaches the top-level renderer unchanged
      await runDevTxGenerate(options);
    });

  devCmd
    .command("fixture")
    .description("Manage dev mock fixtures")
    .command("generate")
    .description(`Generate mock fixtures for testing ${UI.maturity("stable")}`)
    .requiredOption("--type <type>", "Type of fixture (marketplace|dao|payroll|random)")
    .option("--out <path>", "Save fixture as JSON to this file")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      if (options.json) UI.setJsonMode(true);
      const { runDevFixtureGenerate } =
        await import("../runners/dev-fixture-generate-runner.js");
      await runDevFixtureGenerate(options);
    });

  devCmd
    .command("last")
    .description("Act on the latest transaction artifact of the workspace store")
    .option("--inspect", "Print the latest artifact", false)
    .option("--replay", "Show the latest receipt, or verify the latest plan or signed transaction (no replay is run)", false)
    .option("--explain", "Print the `hardkas why` command for the latest artifact", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (options: any) => {
      // --workspace is resolved once (WORKSPACE-AUTHORITY-1); without it this command keeps its default directory
      const ws = invocationWorkspace();
      if (ws.explicit !== undefined) options.workspaceRoot = ws.root;
      const { runDevLast } = await import("../runners/dev-last-runner.js");
      await runDevLast(options);
    });
}
