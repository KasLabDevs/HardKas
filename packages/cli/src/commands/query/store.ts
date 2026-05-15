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

  storeCmd
    .command("export")
    .description("Export logical store state to JSON")
    .option("--output <path>", "Output file path")
    .action(async (options) => {
      try {
        const { HardkasStore } = await import("@hardkas/query-store");
        const store = new HardkasStore();
        store.connect();
        const db = store.getDatabase();
        
        const artifacts = db.prepare("SELECT * FROM artifacts ORDER BY artifactId ASC").all();
        const events = db.prepare("SELECT * FROM events ORDER BY eventId ASC").all();
        
        const dump = { artifacts, events };
        const json = JSON.stringify(dump, null, 2);
        
        if (options.output) {
          fs.writeFileSync(options.output, json);
          UI.success(`Store exported to ${options.output}`);
        } else {
          console.log(json);
        }
        
        store.disconnect();
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
