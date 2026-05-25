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

  // Watchers are strictly optimization hints in HardKAS, never correctness primitives.
  // Missing events are safely recovered via periodic generation scans or targeted syncs.
  const usePollingOverride = process.env.HARDKAS_WATCH_POLLING === "1";
  
  const startChokidar = (polling: boolean) => {
    const opts: chokidar.WatchOptions = {
      ignored: [
        /store\.db/,
        /\.db-journal/,
        /\.db-wal/,
        /\.lock/,
        /tmp/
      ],
      persistent: true,
      ignoreInitial: true,
      usePolling: polling
    };
    if (polling) opts.interval = 1000;
    return chokidar.watch(hardkasPath, opts);
  };

  try {
    let watcher: chokidar.FSWatcher;
    try {
      watcher = startChokidar(usePollingOverride);
    } catch (err: any) {
      if (!usePollingOverride && (err.code === 'ENOSPC' || err.code === 'ENOTSUP')) {
        console.warn(`[Watcher] Native watch failed (${err.code}). Falling back to polling...`);
        watcher = startChokidar(true);
      } else {
        throw err;
      }
    }

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

    const setupEventHandlers = (w: chokidar.FSWatcher) => {
      w.on('add', handleChange).on('change', handleChange).on('unlink', handleChange);
    };

    watcher.on('error', (err: any) => {
      // In chokidar, errors might be emitted via the 'error' event rather than thrown during setup
      if (!usePollingOverride && (err.code === 'ENOSPC' || err.code === 'ENOTSUP')) {
        console.warn(`[Watcher] Native watch error (${err.code}). Restarting with polling...`);
        watcher.close().then(() => {
          watcher = startChokidar(true);
          setupEventHandlers(watcher);
        });
      } else {
        console.error(`[Watcher] Error: ${err.message}`);
      }
    });

    setupEventHandlers(watcher);

  } catch (err: any) {
    console.warn(`⚠️  [Watcher] Failed to start chokidar: ${err.message}. Auto-refresh on changes might be disabled.`);
  }
}
