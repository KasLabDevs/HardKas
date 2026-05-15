import { Command } from "commander";
import { handleLockError, UI } from "../ui.js";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { LOCK_ORDER, listLocks, clearLock } from "@hardkas/core";

export function registerLockCommands(program: Command) {
  const lockCmd = program.command("lock").description("Manage HardKAS workspace locks");

  lockCmd.command("list")
    .description(`List all active workspace locks ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      try {
        const locks = listLocks(process.cwd());
        if (options.json) {
          console.log(JSON.stringify(locks, null, 2));
          return;
        }

        UI.header("Active Workspace Locks");
        if (locks.length === 0) {
          console.log("  No active locks found.\n");
          return;
        }

        for (const lock of locks) {
          const status = lock.isAlive ? pc.green("live") : pc.red("STALE");
          console.log(`  ${pc.bold(lock.name.padEnd(12))} ${pc.dim("PID:")} ${lock.metadata.pid.toString().padEnd(6)} ${pc.dim("State:")} ${status}`);
          console.log(`    ${pc.dim("Command:")} ${lock.metadata.command}`);
          console.log(`    ${pc.dim("Created:")} ${lock.metadata.createdAt}`);
          console.log("");
        }
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  lockCmd.command("status [name]")
    .description(`Show status of one or all locks ${UI.maturity("stable")}`)
    .action(async (name) => {
      try {
        const locks = listLocks(process.cwd());
        if (name) {
          const lock = locks.find(l => l.name === name);
          if (!lock) {
            console.log(`\n  Lock '${name}' is ${pc.green("FREE")}.\n`);
            return;
          }
          UI.header(`Lock Status: ${name}`);
          console.log(`  State:   ${lock.isAlive ? pc.green("HELD (live)") : pc.red("HELD (STALE)")}`);
          console.log(`  PID:     ${lock.metadata.pid}`);
          console.log(`  Host:    ${lock.metadata.hostname}`);
          console.log(`  Command: ${lock.metadata.command}`);
          console.log(`  Created: ${lock.metadata.createdAt}`);
          console.log(`  Path:    ${lock.path}`);
          console.log("");
        } else {
          UI.header("Lock Summary");
          for (const lock of locks) {
             console.log(`  ${pc.bold(lock.name.padEnd(12))}: ${lock.isAlive ? pc.green("HELD") : pc.red("STALE")}`);
          }
          if (locks.length === 0) console.log("  All locks are FREE.");
          console.log("");
        }
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  lockCmd.command("doctor")
    .description(`Analyze locks and identify stale or corrupted ones ${UI.maturity("stable")}`)
    .action(async () => {
      try {
        const locks = listLocks(process.cwd());
        UI.header("Lock Doctor Analysis");
        
        let staleCount = 0;
        for (const lock of locks) {
          if (!lock.isAlive) {
            staleCount++;
            console.log(`  ${pc.red("✗")} Stale lock found: ${pc.bold(lock.name)} (PID: ${lock.metadata.pid})`);
            console.log(`    Suggestion: Run 'hardkas lock clear ${lock.name} --if-dead'`);
          }
        }
        
        if (staleCount === 0) {
          if (locks.length === 0) {
            console.log("  ✓ No locks found. Workspace is clean.");
          } else {
            console.log(`  ✓ All ${locks.length} active lock(s) are held by live processes.`);
          }
        }
        console.log("");
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  lockCmd.command("clear <name>")
    .description(`Safely or forcibly clear a lock ${UI.maturity("stable")}`)
    .option("--if-dead", "Only clear if the process is no longer running", false)
    .option("--force", "Forcibly clear the lock even if the process is alive", false)
    .option("--yes", "Confirm clearing without prompt", false)
    .action(async (name, options) => {
      try {
        if (!options.yes && !options.ifDead) {
          const confirmed = await UI.confirm(`Clearing an active lock may lead to data corruption if another process is writing to the workspace.\n  Are you sure you want to clear '${name}'?`);
          if (!confirmed) return;
        }

        const result = clearLock(process.cwd(), name, { 
          force: options.force, 
          ifDead: options.ifDead 
        });

        if (result.cleared) {
          UI.success(`Lock '${name}' cleared.`);
        } else {
          UI.error(`Could not clear lock '${name}': ${result.reason}`);
          process.exitCode = 1;
        }
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });
}
