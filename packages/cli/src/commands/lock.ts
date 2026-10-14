import { Command } from "commander";
import { handleLockError, UI } from "../ui.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { LOCK_ORDER, listLocks, clearLock } from "@hardkas/core";

type ListedLock = ReturnType<typeof listLocks>[number];

/**
 * EVENT-LEDGER-2 (D7) · what can honestly be said about a lock's holder from this host: `live` or `stale` only when
 * the record names this host (the pid was checked here); `unverifiable` when it names another host or no host at all
 * (a record written by an earlier HardKAS, `{pid, time}`). `listLocks` reports such locks as alive — it assumes a
 * remote holder is alive — and that assumption is said, never shown as a fact.
 */
export type LockLiveness = "live" | "stale" | "unverifiable";

export function lockLivenessOf(lock: ListedLock, thisHost: string = os.hostname()): { liveness: LockLiveness; detail: string } {
  const host = lock.metadata?.hostname;
  if (typeof host !== "string") {
    return { liveness: "unverifiable", detail: "no hostname recorded (a lock written by an earlier HardKAS): its process cannot be placed on a host" };
  }
  if (host !== thisHost) {
    return { liveness: "unverifiable", detail: `held on another host (${host}); liveness cannot be checked from ${thisHost}` };
  }
  return lock.isAlive
    ? { liveness: "live", detail: `process ${lock.metadata.pid} is running on this host` }
    : { liveness: "stale", detail: `process ${lock.metadata.pid} is not running on this host` };
}

function paintLiveness(liveness: LockLiveness): string {
  return liveness === "live" ? pc.green("live") : liveness === "stale" ? pc.red("STALE") : pc.yellow("UNVERIFIABLE");
}

export function registerLockCommands(program: Command) {
  const lockCmd = program.command("lock").description("Manage HardKAS workspace locks");

  lockCmd
    .command("list")
    .description(`List all active workspace locks ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      try {
        const locks = listLocks(process.cwd()).map((lock) => ({ ...lock, ...lockLivenessOf(lock) }));
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "lock list", mode: "cli", result: locks });
          return;
        }

        UI.header("Active Workspace Locks");
        if (locks.length === 0) {
          console.log("  No active locks found.\n");
          return;
        }

        for (const lock of locks) {
          console.log(
            `  ${pc.bold(lock.name.padEnd(12))} ${pc.dim("PID:")} ${String(lock.metadata.pid).padEnd(6)} ${pc.dim("State:")} ${paintLiveness(lock.liveness)}`
          );
          console.log(`    ${pc.dim("Command:")} ${lock.metadata.command}`);
          console.log(`    ${pc.dim("Created:")} ${lock.metadata.createdAt}`);
          if (lock.liveness !== "live") console.log(`    ${pc.dim("Why:")}     ${lock.detail}`);
          console.log("");
        }
      } catch (e) {
        throw e;
      }
    });

  lockCmd
    .command("status [name]")
    .description(`Show status of one or all locks ${UI.maturity("stable")}`)
    .action(async (name) => {
      try {
        const locks = listLocks(process.cwd()).map((lock) => ({ ...lock, ...lockLivenessOf(lock) }));
        if (name) {
          const lock = locks.find((l) => l.name === name);
          if (!lock) {
            console.log(`\n  Lock '${name}' is ${pc.green("FREE")}.\n`);
            return;
          }
          UI.header(`Lock Status: ${name}`);
          console.log(`  State:   HELD (${paintLiveness(lock.liveness)})`);
          if (lock.liveness !== "live") console.log(`  Why:     ${lock.detail}`);
          console.log(`  PID:     ${lock.metadata.pid}`);
          console.log(`  Host:    ${lock.metadata.hostname ?? pc.dim("(not recorded)")}`);
          console.log(`  Command: ${lock.metadata.command}`);
          console.log(`  Created: ${lock.metadata.createdAt}`);
          console.log(`  Path:    ${lock.path}`);
          console.log("");
        } else {
          UI.header("Lock Summary");
          for (const lock of locks) {
            console.log(`  ${pc.bold(lock.name.padEnd(12))}: HELD (${paintLiveness(lock.liveness)})`);
          }
          if (locks.length === 0) console.log("  All locks are FREE.");
          console.log("");
        }
      } catch (e) {
        throw e;
      }
    });

  lockCmd
    .command("doctor")
    .description(
      `Report stale locks (process no longer running on this host) in .hardkas/locks ${UI.maturity("stable")}`
    )
    .action(async () => {
      try {
        const locks = listLocks(process.cwd()).map((lock) => ({ ...lock, ...lockLivenessOf(lock) }));
        UI.header("Lock Doctor Analysis");

        let staleCount = 0;
        let unverifiableCount = 0;
        for (const lock of locks) {
          if (lock.liveness === "stale") {
            staleCount++;
            console.log(
              `  ${pc.red("✗")} Stale lock found: ${pc.bold(lock.name)} (PID: ${lock.metadata.pid}; ${lock.detail})`
            );
            console.log(
              `    Suggestion: Run 'hardkas lock clear ${lock.name} --if-dead'`
            );
          } else if (lock.liveness === "unverifiable") {
            unverifiableCount++;
            console.log(`  ${pc.yellow("?")} Lock whose holder cannot be verified: ${pc.bold(lock.name)} (PID: ${lock.metadata.pid}; ${lock.detail})`);
            console.log(`    Suggestion: only if you know that process is gone, run 'hardkas lock clear ${lock.name} --force'`);
          }
        }

        if (staleCount === 0 && unverifiableCount === 0) {
          if (locks.length === 0) {
            console.log("  ✓ No locks found. Workspace is clean.");
          } else {
            console.log(
              `  ✓ All ${locks.length} active lock(s) are held by live processes on this host.`
            );
          }
        } else {
          const live = locks.length - staleCount - unverifiableCount;
          console.log(`\n  ${locks.length} lock(s): ${live} live, ${staleCount} stale, ${unverifiableCount} unverifiable.`);
        }
        console.log("");
      } catch (e) {
        throw e;
      }
    });

  lockCmd
    .command("clear <name>")
    .description(`Safely or forcibly clear a lock ${UI.maturity("stable")}`)
    .option("--if-dead", "Only clear if the process is no longer running", false)
    .option("--force", "Forcibly clear the lock even if the process is alive", false)
    .option("--yes", "Confirm clearing without prompt", false)
    .action(async (name, options) => {
      try {
        if (!options.yes && !options.force) {
          const confirmed = await UI.confirm(
            `Clearing an active lock may lead to data corruption if another process is writing to the workspace.\n  Are you sure you want to clear '${name}'?`
          );
          if (!confirmed) return;
        }

        let result;
        try {
          result = clearLock(process.cwd(), name, {
            force: options.force,
            ifDead: options.ifDead
          });
        } catch (e: any) {
          // CONTAINMENT-2: a name that is not a lock of .hardkas/locks is a usage error; nothing was read or removed
          if (e?.code !== "LOCK_NAME_INVALID") throw e;
          const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
          throw new HardkasCliError("LOCK_NAME_INVALID", e.message, { exitCode: HardkasExitCode.USAGE_ERROR, cause: e });
        }

        if (result.cleared) {
          UI.success(`Lock '${name}' cleared.`);
        } else {
          const { HardkasCliError } = await import("../cli-errors.js");
          throw new HardkasCliError("LOCK_CLEAR_FAILED", `Could not clear lock '${name}': ${result.reason}`);
        }
      } catch (e) {
        throw e;
      }
    });
}
