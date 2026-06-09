import { Command } from "commander";

export function registerConfigCommands(program: Command) {
  const configCmd = program.command("config").description("Manage HardKAS configuration");

  configCmd
    .command("show")
    .description("Show the current HardKAS configuration")
    .option("--config <path>", "Path to config file")
    .option("--json", "Output as JSON", false)
    .action(async (options: { config?: string; json: boolean }) => {
      const { loadHardkasConfig } = await import("@hardkas/config");
      try {
        const loaded = await loadHardkasConfig(
          options.config ? { configPath: options.config } : {}
        );

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
        throw e;
      }
    });

  configCmd
    .command("networks")
    .description("List configured networks")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json: boolean }) => {
      const { loadHardkasConfig } = await import("@hardkas/config");
      const { UI } = await import("../ui.js");
      const { config } = await loadHardkasConfig();
      const networks = config.networks || {};

      if (opts.json) {
        console.log(JSON.stringify(networks, null, 2));
        return;
      }

      UI.header("HardKAS Networks");

      const header = "  Network        RPC                              Kind";
      console.log(header);
      console.log("  " + "─".repeat(header.length - 2));

      for (const [name, net] of Object.entries(networks)) {
        const rpc = (net as any).rpcUrl || "simulated";
        const kind = (net as any).kind || "unknown";
        console.log(`  ${name.padEnd(14)} ${rpc.padEnd(32)} ${kind}`);
      }
      console.log("");
    });

  configCmd
    .command("init")
    .description("Initialize a basic hardkas.config.ts in the current directory")
    .option("--force", "Overwrite existing config", false)
    .action(async (options) => {
      const { UI } = await import("../ui.js");
      const fs = await import("node:fs");
      const path = await import("node:path");

      const configPath = path.join(process.cwd(), "hardkas.config.ts");
      if (fs.existsSync(configPath) && !options.force) {
        UI.error("hardkas.config.ts already exists. Use --force to overwrite.");
        throw new Error("Command failed");
        return;
      }

      const template = `import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  defaultNetwork: "simulated",
  networks: {
    simulated: { kind: "simulated" }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" }
  }
});
`;
      fs.writeFileSync(configPath, template, "utf-8");
      UI.success("Created hardkas.config.ts");
    });

  configCmd
    .command("repair")
    .description("Repair an invalid or missing hardkas.config.ts")
    .action(async () => {
      const { UI } = await import("../ui.js");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const configPath = path.join(process.cwd(), "hardkas.config.ts");

      const template = `import { defineHardkasConfig } from "@hardkas/sdk";\n\nexport default defineHardkasConfig({\n  defaultNetwork: "simulated",\n  networks: {\n    simulated: { kind: "simulated" }\n  }\n});\n`;

      if (!fs.existsSync(configPath)) {
        UI.warning("Config file missing. Generating a new one...");
        fs.writeFileSync(configPath, template, "utf-8");
        UI.success("Repaired: Created fresh hardkas.config.ts");
        return;
      }

      const { loadHardkasConfig } = await import("@hardkas/config");
      try {
        await loadHardkasConfig();
        UI.success("Config file is valid. No repair needed.");
      } catch (err: any) {
        UI.error(`Config file is invalid: ${err.message}`);
        UI.warning("Backing up and generating a fresh config...");
        fs.copyFileSync(configPath, `${configPath}.backup`);
        fs.writeFileSync(configPath, template, "utf-8");
        UI.success(
          "Repaired: Created fresh hardkas.config.ts (backup saved to hardkas.config.ts.backup)"
        );
      }
    });
}
