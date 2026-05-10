import { Command } from "commander";
import pc from "picocolors";
import { handleError, UI } from "../../ui.js";

export function registerStoreQueryCommands(queryCmd: Command) {
  const storeCmd = queryCmd.command("store").description("SQLite Query Store Management");

  storeCmd
    .command("index")
    .description("Sync artifact and event store to SQLite")
    .action(async () => {
      try {
        const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
        UI.info("Synchronizing local artifacts and events to SQLite store...");
        
        const start = Date.now();
        const store = new HardkasStore();
        store.connect();
        
        const indexer = new HardkasIndexer(store.getDatabase());
        const results = indexer.sync();
        
        const elapsed = Date.now() - start;
        UI.success(`Sync complete (${elapsed}ms).`);
        
        // Quick stats
        const db = store.getDatabase();
        const artCount = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
        const eventCount = (db.prepare("SELECT COUNT(*) as count FROM events").get() as any).count;
        
        UI.field("Total Artifacts", artCount);
        UI.field("Total Events", eventCount);
        
        store.disconnect();
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  storeCmd
    .command("sql <query>")
    .description("Run a raw SQL query against the store")
    .action(async (query: string) => {
      try {
        const { HardkasStore } = await import("@hardkas/query-store");
        const store = new HardkasStore();
        store.connect();
        const db = store.getDatabase();
        
        UI.info(`Executing: ${pc.cyan(query)}`);
        const stmt = db.prepare(query);
        
        if (query.trim().toUpperCase().startsWith("SELECT")) {
          const results = stmt.all();
          if (results.length === 0) {
            UI.info("Query returned no results.");
          } else {
            console.log("");
            console.table(results);
            UI.success(`Fetched ${results.length} row(s).`);
          }
        } else {
          const info = stmt.run();
          UI.success(`Query executed. Changes: ${pc.bold(info.changes.toString())}`);
        }
        
        store.disconnect();
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
