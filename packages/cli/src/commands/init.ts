import type { Command } from "commander";
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
    .option("--install", "Run pnpm/npm install automatically after scaffolding", false)
    .option("--json", "Output results as JSON", false)
    .action(async (name: string | undefined, options: any) => {
      let targetDir = process.cwd();
      const path = await import("node:path");
      const { withLock } = await import("@hardkas/core");
      if (name) {
        targetDir = path.resolve(process.cwd(), name);
      }

      try {
        await withLock(
          {
            rootDir: targetDir,
            name: "workspace",
            command: `hardkas init ${name || ""}`
          },
          async () => {
            const fs = await import("node:fs");
            const { writeFileAtomicSync } = await import("@hardkas/core");

            if (name && !fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            const configFile = path.join(targetDir, "hardkas.config.ts");
            const pkgFile = path.join(targetDir, "package.json");

            if (fs.existsSync(configFile) && !options.force) {
              throw new Error(`hardkas.config.ts already exists in ${name || "current directory"}. Use --force to overwrite.`);
            }

            // Create a basic package.json if it doesn't exist
            if (!fs.existsSync(pkgFile)) {
              const pkgTemplate = {
                name: name || "hardkas-project",
                version: "1.0.0",
                type: "module",
                scripts: {
                  test: "vitest run"
                },
                dependencies: {
                  "@hardkas/sdk": "latest",
                  "@kaspa/core-lib": "^1.6.5"
                },
                devDependencies: {
                  "@hardkas/testing": "latest",
                  "vitest": "^2.0.0",
                  "typescript": "^5.0.0"
                }
              };
              writeFileAtomicSync(pkgFile, JSON.stringify(pkgTemplate, null, 2), {
                encoding: "utf-8"
              });
              if (!options.json) UI.info("Created: package.json");
            }

            const vitestConfigFile = path.join(targetDir, "vitest.config.ts");
            if (!fs.existsSync(vitestConfigFile)) {
              const vitestConfigTemplate = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    pool: "forks"
  }
});
`;
              writeFileAtomicSync(vitestConfigFile, vitestConfigTemplate, { encoding: "utf-8" });
              if (!options.json) UI.info("Created: vitest.config.ts");
            }

            const template = `import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  // HardKAS v0.11.2 Configuration
  defaultNetwork: "simulated",

  // Strict execution policy
  network: {
    allowPublic: false
  },
  artifacts: {
    deterministic: true
  },
  experimental: false,

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
      address: "kaspa:sim_alice"
    },
    bob: {
      kind: "simulated",
      address: "kaspa:sim_bob"
    }
  }
});
`;

            writeFileAtomicSync(configFile, template, { encoding: "utf-8" });

            // Generate a default scenario test
            const testDir = path.join(targetDir, "test");
            if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

            const testFile = path.join(testDir, "payment.test.ts");
            const testTemplate = `import { scenario, expect } from "@hardkas/testing/scenarios";

scenario("payment flow", async ({ hk }) => {
  const alice = await hk.accounts.resolve("alice");
  const bob = await hk.accounts.resolve("bob");

  // Ensure Alice has funds
  await hk.localnet.fund(alice.address, { amount: "100" }); // 100 KAS

  const beforeBob = await hk.accounts.balance(bob.address);

  // Send 10 KAS from Alice to Bob
  const plan = await hk.tx.plan({
    from: alice.name,
    to: bob.address,
    amount: "10"
  });

  const signed = await hk.tx.sign(plan);
  const result = await hk.tx.send(signed);

  expect(result.receipt).toBeDefined();

  const afterBob = await hk.accounts.balance(bob.address);
  expect(afterBob.sompi - beforeBob.sompi).toBe(10n * 100000000n);
});
`;
            if (!fs.existsSync(testFile)) {
              writeFileAtomicSync(testFile, testTemplate, { encoding: "utf-8" });
              if (!options.json) UI.info("Created: test/payment.scenario.ts");
            }

            // Hardened .gitignore
            const gitIgnoreFile = path.join(targetDir, ".gitignore");
            const gitIgnoreEntry = "\n# HardKAS local storage\n.hardkas/\n";
            if (!fs.existsSync(gitIgnoreFile)) {
              writeFileAtomicSync(gitIgnoreFile, gitIgnoreEntry, { encoding: "utf-8" });
              if (!options.json) UI.info("Created: .gitignore");
            } else {
              const content = fs.readFileSync(gitIgnoreFile, "utf-8");
              if (!content.includes(".hardkas/")) {
                // hardkas-append-allow
                fs.appendFileSync(gitIgnoreFile, gitIgnoreEntry, "utf-8");
                if (!options.json) UI.info("Updated: .gitignore (added .hardkas/)");
              }
            }

            // Eager localnet state creation for simulated workspaces
            const isSimulatedDefault =
              !options.network || options.network === "simulated";
            if (isSimulatedDefault) {
              try {
                const { loadOrCreateLocalnetState } = await import("@hardkas/localnet");
                await loadOrCreateLocalnetState({ cwd: targetDir });

                // Also create artifacts directory eagerly
                const artifactsDir = path.join(targetDir, ".hardkas", "artifacts");
                if (!fs.existsSync(artifactsDir)) {
                  fs.mkdirSync(artifactsDir, { recursive: true });
                }

                if (!options.json) UI.info(
                  "Created: .hardkas/localnet.json (simulated accounts funded: 1000 KAS each)"
                );
              } catch {
                // Non-fatal: localnet state will be created lazily on first tx plan
              }
            }

            if (options.install) {
              if (!options.json) UI.info("Running npm install...");
              const { execSync } = await import("node:child_process");
              execSync("npm install", { stdio: options.json ? "ignore" : "inherit", cwd: targetDir });
            }

            if (options.json) {
              const { getOutput } = await import("../output.js");
              getOutput().writeJson({
                ok: true,
                command: "init",
                mode: "cli",
                result: {
                  nextSteps: [
                    ...(name ? [`cd ${name}`] : []),
                    ...(options.install ? [] : ["npm install"]),
                    "npm test"
                  ]
                }
              });
            } else {
              UI.success(
                `HardKAS project '${name || "current"}' initialized successfully.`
              );
              if (name) UI.info(`Project folder: ${targetDir}`);
              UI.info(`Created: hardkas.config.ts (0.11.2)`);
              UI.footer(`Next steps:\n  ` + (name ? `cd ${name}\n  ` : "") + (options.install ? "" : "npm install\n  ") + "npm test");
            }
          }
        );
      } catch (e) {
        handleError(e, "Init failed");
        process.exit(1);
      }
    });

  // --- Up Command ---
  program
    .command("up")
    .description(
      `Boot or validate the HardKAS developer runtime environment ${UI.maturity("stable")}`
    )
    .option("--json", "Output results as JSON", false)
    .action(async () => {
      try {
        await runUp();
      } catch (e) {
        throw new Error("Bootstrap failed");
      }
    });
}
