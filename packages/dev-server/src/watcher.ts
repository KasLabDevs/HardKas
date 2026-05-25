import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";
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
    const watcher = chokidar.watch(hardkasPath, {
      ignored: [
        /store\.db/,
        /\.db-journal/,
        /\.db-wal/,
        /\.lock/,
        /tmp/
      ],
      persistent: true,
      ignoreInitial: true
    });

    const handleChange = (absolutePath: string) => {
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
          
          const syncResult = await backend.syncPaths(pathsToSync);
          
          if (syncResult.artifacts.indexed > 0 || syncResult.events.indexed > 0) {
            console.log(
              `🔄 [Watcher] Targeted Sync completed for ${pathsToSync.length} paths. (Generation: ${syncResult.generationId || 'unknown'})`
            );
          }

          devServerEmitter.emit("projection-synced", {
            timestamp: Date.now(),
            generationId: syncResult.generationId,
            stats: syncResult
          });
        } catch (err: any) {
          console.error("❌ [Watcher] Auto-sync failed:", err.message);
        }
      }, 200);
    };

    watcher.on('add', handleChange).on('change', handleChange).on('unlink', handleChange);
  } catch (err: any) {
    console.warn(`⚠️  [Watcher] Failed to start chokidar: ${err.message}. Auto-refresh on changes might be disabled.`);
  }
}
