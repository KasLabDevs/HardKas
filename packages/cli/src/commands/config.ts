import { Command } from "commander";
import { handleError } from "../ui.js";

export function registerConfigCommands(program: Command) {
  const configCmd = program.command("config").description("Manage HardKAS configuration");

  configCmd.command("show")
    .description("Show the current HardKAS configuration")
    .option("--config <path>", "Path to config file")
    .option("--json", "Output as JSON", false)
    .action(async (options: { config?: string, json: boolean }) => {
      const { loadHardkasConfig } = await import("@hardkas/config");
      try {
        const loaded = await loadHardkasConfig(options.config ? { configPath: options.config } : {});

        if (options.json) {
          console.log(JSON.stringify(loaded, null, 2));
          return;
        }

        console.log("HardKAS config");
        console.log("");
        console.log(`Path: ${loaded.path || "defaults"}`);
        console.log(`Default network: ${loaded.config.defaultNetwork || "simnet"}`);
        console.log("");

        console.log("Networks:");
        const networks = loaded.config.networks || {};
        for (const [name, target] of Object.entries(networks)) {
          console.log(`  ${name} (${target.kind})`);
        }

        if (loaded.config.accounts) {
          console.log("");
          console.log("Accounts:");
          for (const [name, acc] of Object.entries(loaded.config.accounts)) {
            console.log(`  ${name} (${acc.kind})`);
          }
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
