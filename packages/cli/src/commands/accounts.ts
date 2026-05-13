import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runAccountsRealInit } from "../runners/accounts-real-init-runner.js";
import { runAccountsRealGenerate } from "../runners/accounts-real-generate-runner.js";
import { runAccountsBalance } from "../runners/accounts-balance-runner.js";
import { runAccountsFund } from "../runners/accounts-fund-runner.js";

export function registerAccountsCommands(program: Command) {
  const accountsCmd = program.command("accounts").description("Manage HardKAS accounts");

  accountsCmd.command("list")
    .description("List available HardKAS accounts")
    .option("--config <path>", "Path to config file")
    .option("--json", "Output as JSON", false)
    .action(async (options: { config?: string, json: boolean }) => {
      const { loadHardkasConfig } = await import("@hardkas/config");
      const { listHardkasAccounts, describeAccount } = await import("@hardkas/accounts");

      try {
        const loaded = await loadHardkasConfig(options.config ? { configPath: options.config } : {});
        const accounts = listHardkasAccounts(loaded.config);

        if (options.json) {
          console.log(JSON.stringify(accounts.map(a => describeAccount(a)), null, 2));
          return;
        }

        console.log("HardKAS accounts");
        console.log("");
        for (const acc of accounts) {
          const encrypted = acc.kind === "kaspa-private-key" && !acc.privateKeyEnv ? " (encrypted)" : "";
          console.log(`${acc.name.padEnd(12)} ${acc.address?.padEnd(24)} (${acc.kind})${encrypted}`);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  const realAccountsCmd = accountsCmd.command("real").description("Persistent dev account store (L1)");

  realAccountsCmd.command("init")
    .description("Initialize real dev account store")
    .option("--force", "Overwrite existing store", false)
    .option("--json", "Output as JSON", false)
    .action(async (options: { force: boolean, json: boolean }) => {
      try {
        const result = await runAccountsRealInit({ force: options.force });
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(result.formatted);
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  realAccountsCmd.command("import")
    .description("Import an account into the persistent store")
    .option("--name <name>", "Account name")
    .option("--address <address>", "Kaspa address")
    .option("--private-key <hex>", "Private key (plaintext, discouraged)")
    .option("--encrypted", "Import as encrypted keystore (recommended)", false)
    .option("--json", "Output as JSON", false)
    .action(async (options: { name?: string, address?: string, privateKey?: string, encrypted: boolean, json: boolean }) => {
      try {
        const { runAccountsKeystoreImport } = await import("../runners/accounts-keystore-runners.js");
        const result = await runAccountsKeystoreImport(options);
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(result.formatted);
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  realAccountsCmd.command("unlock <name>")
    .description(`Verify keystore access ${UI.maturity("internal")}`)
    .action(async (name: string) => {
      try {
        const { runAccountsKeystoreUnlock } = await import("../runners/accounts-keystore-runners.js");
        await runAccountsKeystoreUnlock({ name });
        console.log(`\n  ✓ Access to account '${name}' verified.`);
        console.log(`  (Note: HardKAS CLI is stateless. Password will be required again for signing operations.)\n`);
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  realAccountsCmd.command("lock <name>")
    .description(`[DEPRECATED] Lock an account ${UI.maturity("internal")}`)
    .action(async (name: string) => {
      console.log(`\n  ℹ Account '${name}' session clear (redundant).`);
      console.log(`    The CLI is already stateless. No secrets are stored in memory between commands.\n`);
    });

  realAccountsCmd.command("change-password <name>")
    .description("Change password for an encrypted account")
    .action(async (name: string) => {
      try {
        const { runAccountsKeystoreChangePassword } = await import("../runners/accounts-keystore-runners.js");
        await runAccountsKeystoreChangePassword({ name });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  realAccountsCmd.command("generate")
    .description("Generate new real dev account(s) using Kaspa SDK")
    .option("--name <name>", "Base name for account(s)")
    .option("--count <number>", "Number of accounts to generate", "1")
    .option("--network <network>", "Kaspa network (simnet, testnet-10, mainnet)", "simnet")
    .option("--json", "Output as JSON", false)
    .action(async (options: { name?: string, count: string, network: string, json: boolean }) => {
      try {
        const result = await runAccountsRealGenerate({
          ...(options.name ? { name: options.name } : {}),
          count: parseInt(options.count, 10),
          networkId: options.network as any
        });
        if (options.json) console.log(JSON.stringify(result.accounts, null, 2));
        else console.log(result.formatted);
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  accountsCmd.command("balance <identifier>")
    .description("Show account balance")
    .option("--network <name>", "Network name (simnet, localnet, etc.)")
    .option("--url <rpc-url>", "Explicit RPC URL")
    .option("--json", "Output as JSON", false)
    .action(async (identifier: string, options: { network?: string, url?: string, json: boolean }) => {
      try {
        const result = await runAccountsBalance({ identifier, network: options.network ?? "simnet", url: options.url ?? "" });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nAccount:  ${result.name}`);
          console.log(`Address:  ${result.address}`);
          console.log(`Balance:  ${Number(result.balanceSompi) / 100_000_000} KAS`);
          console.log(`UTXOs:    ${result.utxoCount}`);
          console.log(`Network:  ${result.network}`);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  accountsCmd.command("fund <identifier>")
    .description("Fund an account (Faucet)")
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
