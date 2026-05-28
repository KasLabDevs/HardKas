import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";
import { getQueryBackend } from "./db.js";
import { devServerEmitter } from "./stream.js";
import { coreEvents } from "@hardkas/core";

let debounceTimer: NodeJS.Timeout | null = null;
const bufferedPaths = new Set<string>();
let isStale = false;
let activeWatcher: chokidar.FSWatcher | null = null;
let reconciliationTimer: NodeJS.Timeout | null = null;

export function startWatcherReconciliationSweep(intervalMs: number = 10000) {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
  }

  reconciliationTimer = setInterval(async () => {
    try {
      const backend = getQueryBackend();
      if (!backend.isReady()) return;

      const status = await backend.doctor();
      if (status.staleArtifacts > 0 || status.zombieArtifacts > 0) {
        console.warn(`🔄 [Watcher] Reconciliation sweep detected ${status.staleArtifacts} stale and ${status.zombieArtifacts} zombie artifacts. Syncing...`);
        const syncResult = await backend.sync();

        devServerEmitter.emit("projection-synced", {
          timestamp: Date.now(),
          generationId: syncResult.generationId,
          stats: syncResult
        });
      }
    } catch (err: any) {
      console.error("❌ [Watcher] Reconciliation sweep failed:", err.message);
    }
  }, intervalMs);
}

export function stopWatcherReconciliationSweep() {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
  }
}

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
  const isLinux = process.platform === "linux";
  const usePollingOverride = process.env.HARDKAS_WATCH_POLLING === "1";
  const forcePolling = usePollingOverride || isLinux;
  
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
      watcher = startChokidar(forcePolling);
    } catch (err: any) {
      if (!forcePolling && (err.code === 'ENOSPC' || err.code === 'ENOTSUP')) {
        console.warn(`[Watcher] Native watch failed (${err.code}). Falling back to polling...`);
        watcher = startChokidar(true);
      } else {
        throw err;
      }
    }
    activeWatcher = watcher;

    const handleChange = (absolutePath: string) => {
      bufferedPaths.add(absolutePath);

      if (absolutePath.includes("artifacts") && absolutePath.endsWith(".json")) {
        try {
          const content = fs.readFileSync(absolutePath, "utf-8");
          const parsed = JSON.parse(content);
          
          if (!parsed.artifactId) {
            parsed.artifactId = parsed.planId || parsed.signedId || parsed.txId || path.basename(absolutePath, ".json");
          }
          
          coreEvents.emit({
            kind: "artifact.written",
            payload: parsed
          } as any);
        } catch (e) {
          console.error("[Watcher] Failed to emit synthetic event:", e);
        }
      }

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
      if (!forcePolling && (err.code === 'ENOSPC' || err.code === 'ENOTSUP')) {
        console.warn(`[Watcher] Native watch error (${err.code}). Restarting with polling...`);
        watcher.close().then(() => {
          watcher = startChokidar(true);
          activeWatcher = watcher;
          setupEventHandlers(watcher);
        });
      } else {
        console.error(`[Watcher] Error: ${err.message}`);
      }
    });

    setupEventHandlers(watcher);

    // Start background reconciliation sweep for self-healing
    startWatcherReconciliationSweep();

  } catch (err: any) {
    console.warn(`⚠️  [Watcher] Failed to start chokidar: ${err.message}. Auto-refresh on changes might be disabled.`);
  }
}

export async function stopHardkasWatcher() {
  stopWatcherReconciliationSweep();
  if (activeWatcher) {
    await activeWatcher.close();
    activeWatcher = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
