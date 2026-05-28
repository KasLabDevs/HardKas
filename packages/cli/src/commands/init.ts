import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runUp } from "../runners/up-runner.js";

export function registerInitCommands(program: Command) {
  // --- Init Command ---
  program
    .command("init")
    .description(`Initialize a new HardKAS project ${UI.maturity("stable")}`)
    .argument("[name]", "Project name or directory")
    .option("--force", "Overwrite existing hardkas.config.ts (in-place only)", false)
    .option("--template <type>", "Project template for new projects", "basic")
    .option("--network <name>", "Default network for new projects", "simulated")
    .option("--accounts <n>", "Number of simulated accounts for new projects", "3")
    .option("--skip-install", "Skip pnpm install for new projects", false)
    .action(async (name: string | undefined, options: any) => {
      let targetDir = process.cwd();
      const path = await import("node:path");
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");

      if (name) {
        targetDir = path.resolve(process.cwd(), name);
      }

      try {
        await withLock({ 
          rootDir: targetDir, 
          name: "workspace", 
          command: `hardkas init ${name || ""}` 
        }, async () => {
          const fs = await import("node:fs");
          const { writeFileAtomicSync } = await import("@hardkas/core");
          
          if (name && !fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          const configFile = path.join(targetDir, "hardkas.config.ts");
          const pkgFile = path.join(targetDir, "package.json");

          if (fs.existsSync(configFile) && !options.force) {
            UI.warning(`hardkas.config.ts already exists in ${name || "current directory"}. Use --force to overwrite.`);
            return;
          }

          // Create a basic package.json if it doesn't exist
          if (!fs.existsSync(pkgFile)) {
            const pkgTemplate = {
              name: name || "hardkas-project",
              version: "1.0.0",
              type: "module",
              dependencies: {
                "@hardkas/sdk": "latest"
              }
            };
            writeFileAtomicSync(pkgFile, JSON.stringify(pkgTemplate, null, 2), { encoding: "utf-8" });
            UI.info("Created: package.json");
          }

          const template = `import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  // HardKAS v0.7.1-alpha Configuration
  defaultNetwork: "simulated",

  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation — no Docker, no RPC, no node"
    },

    simnet: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:18210",
      description: "Local Docker kaspad on simnet — requires hardkas node start"
    }
  },

  accounts: {
    alice: {
      kind: "simulated",
      address: "kaspa:sim_sim_alice"
    },
    bob: {
      kind: "simulated",
      address: "kaspa:sim_sim_bob"
    }
  }
});
`;

          writeFileAtomicSync(configFile, template, { encoding: "utf-8" });
          
          // Hardened .gitignore
          const gitIgnoreFile = path.join(targetDir, ".gitignore");
          const gitIgnoreEntry = "\n# HardKAS local storage\n.hardkas/\n";
          if (!fs.existsSync(gitIgnoreFile)) {
            writeFileAtomicSync(gitIgnoreFile, gitIgnoreEntry, { encoding: "utf-8" });
            UI.info("Created: .gitignore");
          } else {
            const content = fs.readFileSync(gitIgnoreFile, "utf-8");
            if (!content.includes(".hardkas/")) {
              // hardkas-append-allow
              fs.appendFileSync(gitIgnoreFile, gitIgnoreEntry, "utf-8");
              UI.info("Updated: .gitignore (added .hardkas/)");
            }
          }

          UI.success(`HardKAS project '${name || "current"}' initialized successfully.`);
          if (name) UI.info(`Project folder: ${targetDir}`);
          UI.info(`Created: hardkas.config.ts (0.7.1-alpha)`);
          UI.footer(`Run 'cd ${name || "."}' and then 'hardkas up' to start.`);
        });
      } catch (e) {
        handleLockError(e);
        process.exitCode = 1;
      }
    });

  // --- Up Command ---
  program
    .command("up")
    .description(`Boot or validate the HardKAS developer runtime environment ${UI.maturity("stable")}`)
    .action(async () => {
      try {
        await runUp();
      } catch (e) {
        handleError(e, "Bootstrap failed");
        process.exitCode = 1;
      }
    });
}
