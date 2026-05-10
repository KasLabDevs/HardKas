import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runUp } from "../runners/up-runner.js";

export function registerInitCommands(program: Command) {
  // --- Init Command ---
  program
    .command("init")
    .description("Initialize a new HardKAS project")
    .option("--force", "Overwrite existing hardkas.config.ts", false)
    .action(async (options: { force: boolean }) => {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const configFile = path.join(process.cwd(), "hardkas.config.ts");

        if (fs.existsSync(configFile) && !options.force) {
          UI.warning("hardkas.config.ts already exists. Use --force to overwrite.");
          return;
        }

        const template = `import { defineHardkasConfig } from "@hardkas/config";

export default defineHardkasConfig({
  // HardKAS v0.2-alpha Configuration
  defaultNetwork: "simulated",

  networks: {
    simulated: {
      kind: "simulated"
    },

    node: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:18210"
    },

    testnet10: {
      kind: "kaspa-rpc",
      network: "testnet-10",
      rpcUrl: "ws://127.0.0.1:18210"
    }
  },

  accounts: {
    alice: {
      kind: "simulated",
      address: "kaspa:sim_alice"
    },
    bob: {
      kind: "simulated",
      address: "kaspa:sim_bob"
    }
  }
});
`;

        fs.writeFileSync(configFile, template, "utf-8");
        UI.success("HardKAS project initialized successfully.");
        UI.info(`Created: hardkas.config.ts (v0.2-alpha)`);
        UI.footer("Run 'hardkas up' to validate your environment.");
      } catch (e) {
        handleError(e, "Initialization failed");
        process.exitCode = 1;
      }
    });

  // --- Up Command ---
  program
    .command("up")
    .description("Boot or validate the HardKAS developer runtime environment")
    .action(async () => {
      try {
        await runUp();
      } catch (e) {
        handleError(e, "Bootstrap failed");
        process.exitCode = 1;
      }
    });
}
