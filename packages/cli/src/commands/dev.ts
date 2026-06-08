import { Command } from "commander";
import { UI } from "../ui.js";

export function registerDevCommands(program: Command) {
  const devCmd = program
    .command("dev")
    .description("Local development and Igra-native environment tools")
    .option(
      "--once",
      "Initialize dev environment, run health checks, and exit (headless)",
      false
    )
    .option("--headless", "Run headlessly (no UI open)", false)
    .action(async (options: any) => {
      try {
        const { runDevEnv } = await import("../runners/dev-env-runner.js");
        await runDevEnv(options);
      } catch (e) {
        throw e, "Dev environment bootstrap failed";
      }
    });

  devCmd
    .command("create <name>")
    .description(`Create a new dApp project from a template ${UI.maturity("stable")}`)
    .action(async (name: string) => {
      try {
        const { runDevCreate } = await import("../runners/dev-create-runner.js");
        await runDevCreate(name);
      } catch (e) {
        throw e, "Dev create failed";
      }
    });

  devCmd
    .command("init")
    .description(
      `Initialize dApp support in the current workspace ${UI.maturity("stable")}`
    )
    .action(async () => {
      try {
        const { runDevInit } = await import("../runners/dev-init-runner.js");
        await runDevInit();
      } catch (e) {
        throw e, "Dev init failed";
      }
    });

  devCmd
    .command("doctor")
    .description(`Validate local dev environment readiness ${UI.maturity("stable")}`)
    .option("--profile <name>", "L2 network profile name", "igra")
    .option("--rpc-url <url>", "Explicit Igra RPC URL to check")
    .option("--account <name>", "Local EVM account name to verify balance")
    .option("--timeout <ms>", "RPC timeout in milliseconds", "3000")
    .option("--json", "Output as JSON")
    .option("--release", "Run strict release gate checks")
    .action(async (options: any) => {
      try {
        const { runDevDoctor } = await import("../runners/dev-doctor-runner.js");
        await runDevDoctor(options);
      } catch (e) {
        throw e, "Dev doctor failed";
      }
    });

  devCmd
    .command("server")
    .description(`Start the local HardKas Dev Server ${UI.maturity("stable")}`)
    .option("--port <number>", "Port to bind to", "7420")
    .option("--host <string>", "Host to bind to", "127.0.0.1")
    .option("--open", "Open dashboard in browser automatically", false)
    .option(
      "--unsafe-external",
      "Allow external access (binds to 0.0.0.0 if host not specified)",
      false
    )
    .option(
      "--show-token",
      "Show the generated API session token for manual script integration",
      false
    )
    .option("--with-node", "Spawn the localnet node and auto-fund simnet accounts", false)
    .option("--json", "Output status as JSON", false)
    .action(async (options: any) => {
      try {
        const { runDevServer } = await import("../runners/dev-server-runner.js");
        await runDevServer(options);
      } catch (e) {
        throw e, "Dev server failed";
      }
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
    .command("export kasware")
    .description("Export dev account in format suitable for Kasware manual import")
    .option("--alias <alias>", "Alias to export", "alice")
    .action(async (options: any) => {
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
      if (options.workspace) options.workspaceRoot = options.workspace;
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
      try {
        if (options.json) UI.setJsonMode(true);
        const { runDevTxGenerate } = await import("../runners/dev-tx-generate-runner.js");
        await runDevTxGenerate(options);
      } catch (e) {
        throw e, "Dev tx generate failed";
      }
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
      try {
        if (options.json) UI.setJsonMode(true);
        const { runDevFixtureGenerate } =
          await import("../runners/dev-fixture-generate-runner.js");
        await runDevFixtureGenerate(options);
      } catch (e) {
        throw e, "Dev fixture generate failed";
      }
    });

  devCmd
    .command("last")
    .description("Interact with the latest local workflow")
    .option("--inspect", "Inspect the latest artifact", false)
    .option("--replay", "Replay the latest workflow", false)
    .option("--explain", "Explain the latest workflow", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (options: any) => {
      try {
        if (options.workspace) options.workspaceRoot = options.workspace;
        const { runDevLast } = await import("../runners/dev-last-runner.js");
        await runDevLast(options);
      } catch (e) {
        throw e, "Dev last failed";
      }
    });
}
