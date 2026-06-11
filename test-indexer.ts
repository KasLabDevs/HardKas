import { HardkasIndexer } from "@hardkas/query-store/dist/indexer.js";
import { HardkasStore } from "@hardkas/query-store/dist/store.js";
import path from "node:path";

async function main() {
  const store = new HardkasStore({ dbPath: path.join(process.cwd(), ".hardkas", "store.db") });
  store.connect({ autoMigrate: true });
  
  const indexer = new HardkasIndexer(store.db, path.join(process.cwd(), ".hardkas"), { strict: true });
  console.log("Rebuilding indexer...");
  try {
    const res = await indexer.rebuild();
    console.log("Rebuild OK:", res.ok);
  } catch (e) {
    console.error("Rebuild failed:", e);
  }
}
main();
