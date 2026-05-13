import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runUp } from "../runners/up-runner.js";

export function registerInitCommands(program: Command) {
  // --- Init Command ---
  program
    .command("init")
    .description(`Initialize a new HardKAS project ${UI.maturity("stable")}`)
    .argument("[name]", "Project name or directory")
    .option("--force", "Overwrite existing hardkas.config.ts", false)
    .action(async (name: string | undefined, options: { force: boolean }) => {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        
        let targetDir = process.cwd();
        if (name) {
          targetDir = path.join(process.cwd(), name);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
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
          fs.writeFileSync(pkgFile, JSON.stringify(pkgTemplate, null, 2), "utf-8");
          UI.info("Created: package.json");
        }

        const template = `import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  // HardKAS v0.2.2-alpha Configuration
  defaultNetwork: "simnet",

  networks: {
    simnet: {
      kind: "simulated"
    },

    node: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:18210"
    }
  },

  accounts: {
    alice: {
      kind: "simulated",
      address: "kaspasim:sim_alice"
    },
    bob: {
      kind: "simulated",
      address: "kaspasim:sim_bob"
    }
  }
});
`;

        fs.writeFileSync(configFile, template, "utf-8");
        
        // Hardened .gitignore
        const gitIgnoreFile = path.join(targetDir, ".gitignore");
        const gitIgnoreEntry = "\n# HardKAS local storage\n.hardkas/\n";
        if (!fs.existsSync(gitIgnoreFile)) {
          fs.writeFileSync(gitIgnoreFile, gitIgnoreEntry, "utf-8");
          UI.info("Created: .gitignore");
        } else {
          const content = fs.readFileSync(gitIgnoreFile, "utf-8");
          if (!content.includes(".hardkas/")) {
            fs.appendFileSync(gitIgnoreFile, gitIgnoreEntry, "utf-8");
            UI.info("Updated: .gitignore (added .hardkas/)");
          }
        }

        UI.success(`HardKAS project '${name || "current"}' initialized successfully.`);
        if (name) UI.info(`Project folder: ${targetDir}`);
        UI.info(`Created: hardkas.config.ts (v0.2-alpha)`);
        UI.footer(`Run 'cd ${name || "."}' and then 'hardkas up' to start.`);
      } catch (e) {
        handleError(e, "Initialization failed");
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
