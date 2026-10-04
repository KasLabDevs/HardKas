import type { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runUp } from "../runners/up-runner.js";
import { hardkasScaffoldDependencySpec } from "../lib/scaffold-versions.js";

/**
 * E39 · The generated test, signing and planning load the kaspa-wasm this
 * release pins from the HardKAS home, and a fresh machine has none. init leaves
 * that exact pin installed and verified: a verified install of the same pin is
 * reused, anything else comes from the official release asset checked against
 * the pinned SHA-256. Failing to install is an error, never a fallback to
 * another version.
 */
async function bootstrapKaspaWasm(options: { json?: boolean; skipToolchain?: boolean; toolchainFromFile?: string }) {
  const { KASPA_WASM_REFERENCE: ref, verifyManagedToolchain } = await import("@hardkas/core");
  const say = (line: string) => {
    if (!options.json) UI.info(line);
  };

  if (options.skipToolchain) {
    const present = await verifyManagedToolchain(ref);
    say(
      present.ok
        ? `kaspa-wasm ${ref.version} already installed and verified at ${present.dir}`
        : `Skipped (--skip-toolchain): kaspa-wasm ${ref.version} is not installed. ` +
            `Signing, planning and the generated test need it: hardkas toolchain install kaspa-wasm`
    );
    return { id: ref.id, version: ref.version, status: present.ok ? "already-installed" : "skipped", dir: present.dir };
  }

  const { ensureManagedToolchain } = await import("../toolchain-install.js");
  try {
    const result = await ensureManagedToolchain(ref, {
      fromFile: options.toolchainFromFile,
      onFetch: (source) =>
        say(`Installing kaspa-wasm ${ref.version}, the Kaspa WASM SDK this release pins, from ${source.location} ...`)
    });
    say(
      result.status === "installed"
        ? `Installed: kaspa-wasm ${ref.version} at ${result.dir} (SHA-256 checked against the pin)`
        : `kaspa-wasm ${ref.version} already installed and verified at ${result.dir}`
    );
    return { id: ref.id, version: ref.version, status: result.status, dir: result.dir };
  } catch (e: any) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      e?.code ?? "TOOLCHAIN_INSTALL_FAILED",
      `The project files were created, but kaspa-wasm ${ref.version} could not be installed: ${e?.message ?? String(e)}\n` +
        `  Signing, planning and the generated test need it. Retry with: hardkas toolchain install kaspa-wasm` +
        ` (offline: add --from-file <${ref.assetName}>)`,
      { exitCode: e?.exitCode ?? HardkasExitCode.RUNTIME_FAILURE, cause: e }
    );
  }
}

export function registerInitCommands(program: Command) {
  // --- Init Command ---
  program
    .command("init")
    .description(`Initialize a new HardKAS project ${UI.maturity("stable")}`)
    .argument("[name]", "Project name or directory")
    .option("--force", "Overwrite an existing hardkas.config.ts (the other scaffold files are kept)", false)
    .option("--template <type>", "No effect in this release (for templates use 'hardkas create')")
    .option("--network <name>", "'simulated' pre-creates the simulator state (5 accounts, 1000 KAS each); other values skip it. The project's default target is always the simulator", "simulated")
    .option("--accounts <n>", "No effect in this release: init always creates the 5 simulated accounts alice…erin")
    .option("--install", "Run npm install after scaffolding", false)
    .option("--skip-toolchain", "Do not install the pinned kaspa-wasm (signing, planning and the generated test need it)", false)
    .option("--toolchain-from-file <asset>", "Install the pinned kaspa-wasm from its official release asset already on disk")
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

            // Create a basic package.json if it doesn't exist.
            // `@hardkas/*` versions are pinned to the CLI's exact version — never
            // a floating dist-tag — so the scaffold is deterministic per
            // published CLI. See `scaffold-versions.ts` for the invariant.
            if (!fs.existsSync(pkgFile)) {
              const hardkasVersion = hardkasScaffoldDependencySpec();
              const pkgTemplate = {
                name: name || "hardkas-project",
                version: "1.0.0",
                type: "module",
                scripts: {
                  test: "vitest run"
                },
                dependencies: {
                  "@hardkas/sdk": hardkasVersion
                },
                devDependencies: {
                  // PAPERCUTS #35: the project runs `hardkas …` from its own node_modules (npx / scripts).
                  "@hardkas/cli": hardkasVersion,
                  "@hardkas/testing": hardkasVersion,
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

            // DEF-2 (Wave 2): the emitted config intentionally omits an
            // `accounts: { alice, bob }` declaration. HardKAS deterministic
            // account resolution owns those identities and adapts them per
            // execution target (synthetic in simulator, kaspa in real-node).
            // Pre-declaring them with a fixed kind, as prior versions did,
            // forced a collision on every real-node lifecycle command. The
            // 0.11 → 0.12 migration already removed them from
            // DEFAULT_HARDKAS_CONFIG.accounts; this scaffold aligns with it.
            // Consumer-authored accounts and the cross-world protection remain
            // fully authoritative — this only stops the SCAFFOLD from
            // pre-declaring conflicting entries in fresh workspaces.
            const template = `import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  // HardKAS v0.12.0-rc.26 Configuration
  execution: {
    default: "simulator",
    targets: {
      simulator: {
        mode: "simulator",
        domain: "kaspa-l1",
        network: "simulated"
      },
      localnet: {
        mode: "localnet",
        domain: "kaspa-l1",
        network: "simnet"
      }
    }
  },

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
              // Demo-ready · E27: announce the file actually written (it used to say payment.scenario.ts).
              if (!options.json) UI.info(`Created: ${path.relative(targetDir, testFile).split(path.sep).join("/")}`);
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

                // Also create artifacts directory eagerly, through the store's gate (ARTIFACT-MUTATION-1)
                const artifactsDir = path.join(targetDir, ".hardkas", "artifacts");
                if (!fs.existsSync(artifactsDir)) {
                  const { ArtifactStoreMutation } = await import("@hardkas/artifacts");
                  await new ArtifactStoreMutation(targetDir).ensureDir();
                }

                if (!options.json) UI.info(
                  "Created: .hardkas/localnet.json (simulated accounts funded: 1000 KAS each)"
                );
              } catch {
                // Non-fatal: localnet state will be created lazily on first tx plan
              }
            }

            const toolchain = await bootstrapKaspaWasm(options);

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
                  toolchain,
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
              UI.info(`Created: hardkas.config.ts (0.12.0-rc.26)`);
              UI.footer(`Next steps:\n  ` + (name ? `cd ${name}\n  ` : "") + (options.install ? "" : "npm install\n  ") + "npm test");
            }
          }
        );
      } catch (e) {
        // A structured error (E39: the toolchain step) goes to the top-level
        // handler, which prints it, writes the JSON envelope and uses its exit code.
        if ((e as any)?.name === "HardkasCliError") throw e;
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
