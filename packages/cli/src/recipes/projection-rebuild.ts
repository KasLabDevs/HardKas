import { runDevTxSend } from "../runners/dev-tx-runners.js";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { UI } from "../ui.js";

export default async function runProjectionRebuildRecipe(sandboxRoot: string) {
  UI.info("Generating canonical workflow artifacts...");
  
  await runDevTxSend({
    from: "alice",
    to: "bob",
    amount: "1",
    workspaceRoot: sandboxRoot,
    quiet: true
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  const dbPath = path.join(sandboxRoot, ".hardkas", "store.db");
  const walPath = path.join(sandboxRoot, ".hardkas", "store.db-wal");
  const shmPath = path.join(sandboxRoot, ".hardkas", "store.db-shm");
  
  UI.info("Intentionally corrupting local projection (store.db)...");
  
  try {
    const { disconnectQueryBackend, stopWatcherReconciliationSweep } = await import("@hardkas/dev-server");
    stopWatcherReconciliationSweep();
    disconnectQueryBackend();
  } catch (e) {
    // Silently ignore if running outside dev-server
  }

  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch (e) {
    // ignore ebusy if windows locks it, just empty it
    try {
      fs.writeFileSync(dbPath, "");
    } catch(e2) {}
  }

  console.log(`\n${pc.red("Projection degraded.")}`);
  console.log(`${pc.blue("Artifacts remain canonical local truth.")}\n`);

  console.log(pc.bold("Rebuilding projection..."));
  
  const { HardkasStore, SqliteQueryBackend } = await import("@hardkas/query-store");
  const { withLock } = await import("@hardkas/core");
  
  const store = new HardkasStore({ dbPath });
  store.connect({ autoMigrate: true });
  
  await withLock({ rootDir: sandboxRoot, name: "query-store", timeoutMs: 30000, wait: true }, async () => {
    const backend = new SqliteQueryBackend(store);
    await backend.rebuild({ strict: true, cwd: sandboxRoot });
  });

  console.log(pc.green("Projection restored.\n"));
  
  try {
    const { startWatcherReconciliationSweep, getQueryBackend } = await import("@hardkas/dev-server");
    getQueryBackend(); // Reconnects the db
    startWatcherReconciliationSweep();
  } catch (e) {}
  
  console.log(pc.yellow(pc.bold("Recipe completed: projection-rebuild\n")));
}
