import fs from "node:fs";
import path from "node:path";
import { getQueryBackend } from "./db.js";
import { devServerEmitter } from "./stream.js";

let debounceTimer: NodeJS.Timeout | null = null;
const bufferedPaths = new Set<string>();
let isStale = false;

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

      const absolutePath = path.join(hardkasPath, filename);
      bufferedPaths.add(absolutePath);

      if (!isStale) {
        isStale = true;
        devServerEmitter.emit("projection-stale", { timestamp: Date.now() });
      }

      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        const pathsToSync = Array.from(bufferedPaths);
        bufferedPaths.clear();
        isStale = false;

        try {
          const backend = getQueryBackend();
          
          // Use Targeted Reindex if we have specific paths, otherwise fallback to global sync
          const syncResult = await backend.syncPaths(pathsToSync);
          
          if (syncResult.artifacts.indexed > 0 || syncResult.events.indexed > 0) {
            console.log(
              `🔄 [Watcher] Targeted Sync completed for ${pathsToSync.length} paths. (Generation: ${syncResult.generationId || 'unknown'})`
            );
          }

          // Emit real-time synchronization updates to the dashboard via SSE
          devServerEmitter.emit("projection-synced", {
            timestamp: Date.now(),
            generationId: syncResult.generationId,
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
