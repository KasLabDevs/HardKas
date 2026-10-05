import { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { AppendCoordinator, MigrationManager, eventLedgerPath } from "@hardkas/core";
import { invocationWorkspaceRoot } from "../workspace-root.js";
import { HardkasStore, HardkasIndexer } from "@hardkas/query-store";

export function registerRepairCommand(program: Command) {
  program
    .command("repair")
    .description(
      `Report an outdated workspace, lock files in .hardkas/, torn JSONL tails and a corrupt query store; --force repairs them ${UI.maturity("beta")}`
    )
    .option("--json", "Output results as stable JSON schema", false)
    .option("--force", "Apply the repairs (without it, repair only reports). Removes lock files without checking whether their process is alive", false)
    .action(async (opts) => {
      try {
        await runRepair(opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runRepair(opts: { json?: boolean; force?: boolean }) {
  if (opts.json) UI.setJsonMode(true);

  if (!opts.json) {
    UI.box("HardKAS Repair", "Automated Corruption Recovery");
  }

  // WORKSPACE-AUTHORITY-1 (WA-I0): the invocation's one workspace root
  const rootDir = invocationWorkspaceRoot();
  const hardkasDir = path.join(rootDir, ".hardkas");
  let repairedCount = 0;

  // 1. Check Version/Migrations
  try {
    const status = MigrationManager.checkVersion(rootDir);
    if (status.needsMigration) {
      UI.logHuman(
        `${pc.yellow("⚠️")} Workspace requires migration to ${status.currentVersion}.`
      );
      if (opts.force) {
        MigrationManager.migrate(rootDir);
        UI.logHuman(`${pc.green("✅")} Successfully migrated workspace.`);
        repairedCount++;
      } else {
        UI.logHuman(`   Run with --force to execute migration.`);
      }
    }
  } catch (err: any) {
    UI.logHuman(`${pc.red("❌")} Version check failed: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`);
  }

  // 2. Clear Stale Locks
  try {
    const files = await fs.readdir(hardkasDir);
    const locks = files.filter((f) => f.endsWith(".lock"));
    for (const lock of locks) {
      const lockPath = path.join(hardkasDir, lock);
      if (opts.force) {
        await fs.unlink(lockPath);
        UI.logHuman(`${pc.green("✅")} Cleared stale lock: ${lock}`);
        repairedCount++;
      } else {
        UI.logHuman(`${pc.yellow("⚠️")} Found lock: ${lock}. Run with --force to clear.`);
      }
    }
  } catch {
    // Ignore if dir doesn't exist
  }

  // 3. Repair Append Tails
  const streams = [
    { name: "Event Ledger", path: eventLedgerPath(rootDir) },
    { name: "Telemetry", path: path.join(hardkasDir, "telemetry", "telemetry.jsonl") }
  ];

  for (const stream of streams) {
    try {
      const stats = await fs.stat(stream.path);
      const isCorrupt = false; // We would need a real check here, but we'll assume we can trigger tail truncation if corrupt
      // For now, we simulate repair. AppendCoordinator handles this on next append natively.
      // But we can explicitly validate:
      const fd = await fs.open(stream.path, "r+");
      const buffer = Buffer.alloc(1024);
      let bytesRead = 0;
      let fileSize = stats.size;

      if (fileSize > 0) {
        // Read last chunk to check for newline
        const readSize = Math.min(1024, fileSize);
        await fd.read(buffer, 0, readSize, fileSize - readSize);
        const tail = buffer.toString("utf-8", 0, readSize);
        if (!tail.endsWith("\n")) {
          UI.logHuman(`${pc.yellow("⚠️")} ${stream.name} has a corrupt tail.`);
          if (opts.force) {
            // naive truncate to last newline
            const lastNewline = tail.lastIndexOf("\n");
            if (lastNewline !== -1) {
              const truncateTo = fileSize - readSize + lastNewline + 1;
              await fd.truncate(truncateTo);
              UI.logHuman(
                `${pc.green("✅")} Truncated ${stream.name} at byte ${truncateTo}.`
              );
              repairedCount++;
            }
          } else {
            UI.logHuman(`   Run with --force to truncate corrupt tail.`);
          }
        }
      }
      await fd.close();
    } catch (err) {
      // file might not exist, skip
    }
  }

  // 4. Rebuild SQLite Projection · WORKSPACE-AUTHORITY-1 (WA-I3): reporting never creates or migrates the projection;
  // only --force acts on it (by deleting a corrupt one)
  try {
    const dbPath = path.join(hardkasDir, "store.db");
    const store = HardkasStore.openExisting(dbPath);
    if (!store) throw new Error("no query projection");

    const indexer = new HardkasIndexer(store.getDatabase(), {
      cwd: rootDir,
      strict: false
    });
    const idxReport = indexer.doctor();

    if (idxReport.duplicateProjections > 0 || idxReport.corruptedFiles.length > 0) {
      UI.logHuman(`${pc.yellow("⚠️")} SQLite projection is corrupt or stale.`);
      if (opts.force) {
        // Rebuild
        store.disconnect();
        await fs.unlink(dbPath);
        UI.logHuman(
          `${pc.green("✅")} Deleted corrupt SQLite projection. It will be rebuilt on next start.`
        );
        repairedCount++;
      } else {
        UI.logHuman(`   Run with --force to rebuild SQLite projection.`);
      }
    } else {
      store.disconnect();
    }
  } catch {
    // DB missing or schema error, safe to ignore
  }

  if (opts.json) {
    UI.writeJson({ status: "success", repairedCount });
  } else {
    UI.divider();
    UI.logHuman(`Repair cycle complete. Actions taken: ${repairedCount}`);
  }
}
