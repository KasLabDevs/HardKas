import { HardkasStore, SqliteQueryBackend } from "@hardkas/query-store";

let store: HardkasStore | null = null;
let queryBackend: SqliteQueryBackend | null = null;

import path from "node:path";

export function getQueryBackend(): SqliteQueryBackend {
  if (!queryBackend) {
    const rootDir = process.env.HARDKAS_ROOT || process.cwd();
    store = new HardkasStore({ dbPath: path.join(rootDir, ".hardkas", "store.db") });
    try {
      store.connect({ autoMigrate: true });
    } catch (e) {
      console.warn("⚠️  [Query store connect failed, trying migration]", e);
    }
    queryBackend = new SqliteQueryBackend(store);
  }
  return queryBackend;
}

export function disconnectQueryBackend(): void {
  if (store) {
    store.disconnect();
    store = null;
  }
  queryBackend = null;
}
