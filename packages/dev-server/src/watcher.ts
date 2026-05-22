import fs from "node:fs";
import path from "node:path";
import { getQueryBackend } from "./db.js";
import { devServerEmitter } from "./stream.js";

let debounceTimer: NodeJS.Timeout | null = null;

export function startHardkasWatcher() {
  const rootDir = process.env.HARDKAS_ROOT || process.cwd();
  const hardkasPath = path.join(rootDir, ".hardkas");
  
  if (!fs.existsSync(hardkasPath)) {
    try {
      fs.mkdirSync(hardkasPath, { recursive: true });
    } catch (e) {
      console.warn(`[Watcher] Could not create .hardkas directory: ${e}`);
      return;
    }
  }

  console.log(`📡 [Watcher] Monitoring ${hardkasPath} for changes...`);

  try {
    fs.watch(hardkasPath, { recursive: true }, (eventType, filename) => {
      // Ignore database files and temporary/lock files to prevent infinite loops
      if (
        !filename ||
        filename.includes("store.db") ||
        filename.includes(".db-journal") ||
        filename.includes(".db-wal") ||
        filename.includes(".lock") ||
        filename.includes("tmp")
      ) {
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        try {
          const backend = getQueryBackend();
          const syncResult = await backend.sync();
          
          if (syncResult.artifacts.indexed > 0 || syncResult.events.indexed > 0) {
            console.log(
              `🔄 [Watcher] Changes detected: ${filename}. Auto-synced query-store. (Artifacts: ${syncResult.artifacts.indexed}, Events: ${syncResult.events.indexed})`
            );
          }

          // Emit real-time synchronization updates to the dashboard via SSE
          devServerEmitter.emit("query-synced", {
            timestamp: Date.now(),
            filename,
            stats: syncResult
          });
        } catch (err: any) {
          console.error("❌ [Watcher] Auto-sync failed:", err.message);
        }
      }, 200);
    });
  } catch (err: any) {
    console.warn(`⚠️  [Watcher] Failed to start fs.watch: ${err.message}. Auto-refresh on changes might be disabled.`);
  }
}
