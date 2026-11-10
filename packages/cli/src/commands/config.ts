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
          const { getOutput } = await import("../output.js");
          const { redactSecretFields } = await import("@hardkas/core");
          // EVIDENCE-TRUST-1 (D9): showing the configuration reveals no secret written into it (an inline privateKey,
          // a password): the field stays, its value is "[REDACTED]".
          getOutput().writeJson({ ok: true, command: "config show", mode: "cli", result: redactSecretFields(loaded, "mask") });
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
        const { getOutput } = await import("../output.js");
        const { redactSecretFields } = await import("@hardkas/core");
        // EVIDENCE-TRUST-1 (D9): no secret written into the configuration is shown.
        getOutput().writeJson({ ok: true, command: "config networks", mode: "cli", result: redactSecretFields(networks, "mask") });
        return;
      }

      UI.header("HardKAS Networks");

      const header = "  Network        RPC                              Kind";
      console.log(header);
      console.log("  " + "─".repeat(header.length - 2));

      for (const [name, net] of Object.entries(networks)) {
        // TESTNET-PORT-COLLISION-1: a built-in public network carries no endpoint until the user declares one
        const rpc = (net as any).rpcUrl || ((net as any).kind === "simulated" ? "simulated" : "(not declared)");
        const kind = (net as any).kind || "unknown";
        console.log(`  ${name.padEnd(14)} ${rpc.padEnd(32)} ${kind}`);
      }
      console.log("");
    });

  configCmd
    .command("init")
    .description("Initialize a basic hardkas.config.ts in the current directory (the config imports nothing, so it loads before any install)")
    .option("--force", "Replace an existing hardkas.config.ts; the original is first copied to a backup that never overwrites another", false)
    .option("--json", "Output results as JSON", false)
    .action(async (options) => {
      const { UI } = await import("../ui.js");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { HardkasCliError } = await import("../cli-errors.js");
      const { scaffoldConfigSource, configFilesIn, backupConfigFile, configLoadError } = await import("../config-scaffold.js");

      const configPath = path.join(process.cwd(), "hardkas.config.ts");
      // ESCALÓN 3 · P1: every hardkas.config.* counts. A new .ts next to a .mjs would silently shadow it (the loader
      // prefers .ts), so --force replaces hardkas.config.ts only, and never shadows a config of another name.
      const existing = configFilesIn(process.cwd());
      const others = existing.filter((f) => f !== configPath);
      if (others.length > 0) {
        throw new HardkasCliError(
          "CONFIG_EXISTS",
          `${path.basename(others[0]!)} already exists. config init writes hardkas.config.ts, which would take precedence over it. Nothing was changed.`,
          { suggestion: `Edit ${path.basename(others[0]!)}, or rename it yourself if you want a new hardkas.config.ts.` }
        );
      }
      if (existing.includes(configPath) && !options.force) {
        throw new HardkasCliError("CONFIG_EXISTS", "hardkas.config.ts already exists. Nothing was changed. Use --force to replace it (a backup is kept).");
      }
      const backup = existing.includes(configPath) ? backupConfigFile(configPath) : undefined;

      // PAPERCUTS #38: generated configs declare their target through the `execution` contract.
      // DEF-2: no pre-declared accounts (the deterministic dev accounts are resolved per target, not declared).
      fs.writeFileSync(configPath, scaffoldConfigSource(), "utf-8");
      const loadError = await configLoadError(configPath);
      if (loadError !== undefined) {
        if (backup) fs.copyFileSync(backup, configPath);
        else fs.rmSync(configPath, { force: true });
        throw new HardkasCliError("CONFIG_TEMPLATE_INVALID", `The generated config did not load, so it was not kept: ${loadError}`);
      }
      if (options.json) {
        const { getOutput } = await import("../output.js");
        getOutput().writeJson({ ok: true, command: "config init", mode: "cli", result: { path: configPath, ...(backup ? { backup } : {}) } });
      } else {
        UI.success("Created hardkas.config.ts");
        if (backup) UI.info(`The previous hardkas.config.ts was copied to ${path.basename(backup)}`);
      }
    });

  configCmd
    .command("repair")
    .description("Repair an invalid or missing hardkas config: an invalid one is copied to a backup that never overwrites another, then replaced by a minimal config that loads")
    .option("--json", "Output results as JSON", false)
    .action(async (options: { json: boolean }) => {
      const { UI } = await import("../ui.js");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { HardkasCliError } = await import("../cli-errors.js");
      const { scaffoldConfigSource, configFilesIn, backupConfigFile, configLoadError } = await import("../config-scaffold.js");
      const write = async (status: string, extra: Record<string, unknown>, text: string) => {
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "config repair", mode: "cli", result: { status, ...extra } });
        } else {
          UI.success(text);
        }
      };

      // ESCALÓN 3 · P1: the config repaired is the one the loader reads in this directory (any hardkas.config.*), never
      // a new .ts that would shadow it. The template imports nothing and is loaded before it is kept, so a second run
      // finds a valid config and changes nothing; the original's backup is never overwritten.
      const template = scaffoldConfigSource();
      const configPath = configFilesIn(process.cwd())[0];

      if (!configPath) {
        const created = path.join(process.cwd(), "hardkas.config.ts");
        if (!options.json) UI.warning("Config file missing. Generating a new one...");
        fs.writeFileSync(created, template, { encoding: "utf-8", flag: "wx" });
        const loadError = await configLoadError(created);
        if (loadError !== undefined) {
          fs.rmSync(created, { force: true });
          throw new HardkasCliError("CONFIG_TEMPLATE_INVALID", `The generated config did not load, so it was not kept: ${loadError}`);
        }
        await write("repaired_missing", { path: created }, "Repaired: Created fresh hardkas.config.ts");
        return;
      }

      const loadError = await configLoadError(configPath);
      if (loadError === undefined) {
        await write("valid", { path: configPath }, `Config file is valid. No repair needed (${path.basename(configPath)}).`);
        return;
      }

      if (!options.json) {
        UI.error(`Config file is invalid: ${loadError}`);
        UI.warning("Backing up and generating a fresh config...");
      }
      const backup = backupConfigFile(configPath);
      fs.writeFileSync(configPath, template, "utf-8");
      const templateError = await configLoadError(configPath);
      if (templateError !== undefined) {
        fs.copyFileSync(backup, configPath); // the original goes back; its backup stays
        throw new HardkasCliError(
          "CONFIG_REPAIR_FAILED",
          `The replacement config did not load, so the original was restored (backup: ${backup}): ${templateError}`
        );
      }
      await write(
        "repaired_invalid",
        { path: configPath, backup },
        `Repaired: Created fresh ${path.basename(configPath)} (backup saved to ${path.basename(backup)})`
      );
    });
}
