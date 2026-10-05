/**
 * Query Engine — orchestrates adapter selection and pipeline execution.
 *
 * Pipeline: Source → Scan → Filter → Sort → Paginate → Explain → Serialize
 *
 * All execution is deterministic over the input artifact store.
 */
import { FilesystemQueryBackend } from "./backend-fs.js";
import type { QueryBackend } from "./backend.js";
import { ArtifactQueryAdapter } from "./adapters/artifact-adapter.js";
import { LineageQueryAdapter } from "./adapters/lineage-adapter.js";
import { ReplayQueryAdapter } from "./adapters/replay-adapter.js";
import { DagQueryAdapter } from "./adapters/dag-adapter.js";
import { EventsQueryAdapter } from "./adapters/events-adapter.js";
import { TxQueryAdapter } from "./adapters/tx-adapter.js";
import type { QueryAdapter, QueryDomain, QueryRequest, QueryResult } from "./types.js";
import { withLock } from "@hardkas/core";
import fs from "node:fs";
import path from "node:path";

import type { QueryBackendSelection, QueryBackendMode, QueryProjectionStatus, QueryStoreStatus } from "./types.js";
import { QueryBackendInitializationError } from "./errors.js";

export interface QueryBackendLoader {
  loadSqlite(options: { databasePath?: string }): Promise<QueryBackend>;
  /** The loaded projection's state against the workspace (WORKSPACE-AUTHORITY-1); without it freshness is unverified. */
  projectionStatus?(backend: QueryBackend, workspaceRoot: string): Promise<QueryProjectionStatus>;
  /** Releases a loaded projection the engine decided not to use. */
  release?(backend: QueryBackend): Promise<void>;
}

const defaultLoader: QueryBackendLoader = {
  async loadSqlite(options) {
    if (!options.databasePath) {
      throw new Error("databasePath is required when loading sqlite backend");
    }
    const { HardkasStore, SqliteQueryBackend } = await import("@hardkas/query-store");
    // WORKSPACE-AUTHORITY-1 (WA-I3): a query never creates, migrates or reconfigures the projection (nor its directory)
    const store = HardkasStore.openExisting(options.databasePath);
    if (!store) throw new Error(`There is no query projection at ${options.databasePath}`);
    return new SqliteQueryBackend(store);
  },
  async projectionStatus(backend, workspaceRoot) {
    const { projectionStatusOf } = await import("@hardkas/query-store");
    return projectionStatusOf((backend as any).store, workspaceRoot);
  },
  async release(backend) {
    (backend as any).store?.disconnect?.();
  }
};

export interface QueryEngineOptions {
  /** Root directory for artifact/lineage scanning (typically .hardkas/ or project root). */
  readonly artifactDir: string;
  /** Primary data backend. If not provided, defaults to filesystem. */
  readonly backend?: QueryBackend;
  /** Explicit backend mode requested. */
  readonly backendMode?: QueryBackendMode;
  /** Explicit database path for sqlite backend. */
  readonly databasePath?: string;
  /** Automatically synchronize the store before queries. Requires 'query-store' lock. */
  readonly autoSync?: boolean;
  /** Whether to wait for the lock if held. */
  readonly waitLock?: boolean;
  /** Injected loader for testing. */
  readonly loader?: QueryBackendLoader;
}

export class QueryEngine {
  private readonly adapters: Map<QueryDomain, QueryAdapter>;
  public readonly backend: QueryBackend;

  public readonly backendSelection: QueryBackendSelection;

  /**
   * Primary entry point for creating a QueryEngine with deterministic backend selection.
   */
  static async create(options: QueryEngineOptions): Promise<QueryEngine> {
    let backend = options.backend;
    let backendSelection: QueryBackendSelection;
    const mode = options.backendMode || "auto";
    const loader = options.loader || defaultLoader;

    if (backend) {
        // If a backend instance is directly provided, assume filesystem defaults for selection reporting
        backendSelection = { requested: "filesystem", selected: "filesystem" };
    } else {
        const defaultDbPath = path.join(options.artifactDir, ".hardkas", "store.db");
        const checkDbPath = options.databasePath ?? defaultDbPath;

        if (mode === "auto" && !fs.existsSync(checkDbPath)) {
            backend = new FilesystemQueryBackend(options.artifactDir);
            backendSelection = {
                requested: mode,
                selected: "filesystem",
                fallback: { code: "SQLITE_MISSING", causeName: "StoreNotFound" },
                projection: { state: "absent", dbPath: checkDbPath, reason: "there is no projection file; queries read the workspace" }
            };
        } else if (mode === "filesystem") {
            backend = new FilesystemQueryBackend(options.artifactDir);
            backendSelection = { requested: mode, selected: "filesystem" };
        } else {
        // mode is "sqlite" or "auto"
        let loaded: QueryBackend | undefined;
        try {
            loaded = await loader.loadSqlite({ databasePath: checkDbPath });

            // Handle autoSync logic specifically for Sqlite backend
            if (options.autoSync && 'store' in loaded) {
                const sqlite = loaded;
                await withLock(
                  {
                    rootDir: options.artifactDir,
                    name: "query-store",
                    command: "query-engine-auto-sync",
                    wait: options.waitLock ?? false,
                    timeoutMs: 5000
                  },
                  async () => {
                    const store = (sqlite as any).store;
                    store.connect({ autoMigrate: true });
                    // Requires dynamically importing HardkasIndexer for sync
                    const { HardkasIndexer } = await import("@hardkas/query-store");
                    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: options.artifactDir });
                    await indexer.sync();
                  }
                );
            } else if ('store' in loaded) {
                ((loaded as any).store).connect();
            }
        } catch (error: any) {
            if (loaded) {
                await loader.release?.(loaded);
                loaded = undefined;
            }
            if (mode === "sqlite") {
                throw new QueryBackendInitializationError("sqlite", options.databasePath, { cause: error });
            } else {
                // auto mode fallback
                backend = new FilesystemQueryBackend(options.artifactDir);
                backendSelection = {
                    requested: mode,
                    selected: "filesystem",
                    fallback: {
                        code: "SQLITE_INITIALIZATION_FAILED",
                        causeName: error?.name || "UnknownError"
                    }
                };
            }
        }

        if (loaded) {
            // WORKSPACE-AUTHORITY-1 (WA-I2): a projection never becomes the truth merely because it exists. AUTO uses it
            // only when it is proven built from exactly the workspace's current artifacts and ledger; otherwise the
            // workspace answers and the projection's state is reported. An explicit `sqlite` request is honoured even
            // when stale, and the answer says so (never a silent switch to the workspace).
            let projection: QueryProjectionStatus;
            try {
                projection = loader.projectionStatus
                    ? await loader.projectionStatus(loaded, options.artifactDir)
                    : { state: "unverified", reason: "this backend reports no freshness" };
            } catch (error: any) {
                projection = { state: "unreadable", reason: error?.message ?? String(error) };
            }
            if (mode === "auto" && projection.state !== "fresh") {
                await loader.release?.(loaded);
                backend = new FilesystemQueryBackend(options.artifactDir);
                backendSelection = {
                    requested: mode,
                    selected: "filesystem",
                    fallback: {
                        code: `PROJECTION_${projection.state.toUpperCase()}` as "PROJECTION_STALE",
                        causeName: "ProjectionNotFresh"
                    },
                    projection
                };
            } else {
                backend = loaded;
                backendSelection = { requested: mode, selected: "sqlite", projection };
            }
        }
    }
    }

    return new QueryEngine({
      ...options,
      backend: backend!
    }, backendSelection!);
  }

  constructor(options: QueryEngineOptions, backendSelection?: QueryBackendSelection) {
    this.backend = options.backend || new FilesystemQueryBackend(options.artifactDir);
    this.backendSelection = backendSelection || { requested: "filesystem", selected: "filesystem" };

    this.adapters = new Map();
    this.adapters.set(
      "artifacts",
      new ArtifactQueryAdapter(options.artifactDir, this.backend)
    );
    this.adapters.set(
      "lineage",
      new LineageQueryAdapter(options.artifactDir, this.backend)
    );
    this.adapters.set(
      "replay",
      new ReplayQueryAdapter(options.artifactDir, this.backend)
    );
    this.adapters.set("dag", new DagQueryAdapter(options.artifactDir, this.backend));
    this.adapters.set(
      "events",
      new EventsQueryAdapter(options.artifactDir, this.backend)
    );
    this.adapters.set("tx", new TxQueryAdapter(options.artifactDir, this.backend));
  }

  /**
   * Execute a query request against the appropriate adapter.
   */
  async execute<T = unknown>(request: QueryRequest): Promise<QueryResult<T>> {
    const adapter = this.adapters.get(request.domain);
    if (!adapter) {
      throw new Error(`No adapter registered for domain: ${request.domain}`);
    }

    if (!adapter.supportedOps().includes(request.op)) {
      throw new Error(
        `Operation "${request.op}" is not supported by the "${request.domain}" adapter. ` +
          `Supported: ${adapter.supportedOps().join(", ")}`
      );
    }

    const result = await adapter.execute(request);

    // Inject freshness and backend info into annotations. WORKSPACE-AUTHORITY-1: a projection's freshness is the one its
    // selection proved (or failed to prove) against the workspace, never a guess from file timestamps.
    const backendUsed = this.backend.kind();
    const projection = this.backendSelection.projection;
    const freshness: QueryStoreStatus =
      backendUsed === "sqlite" && projection
        ? projection.state === "fresh"
          ? "fresh"
          : projection.state === "unverified"
            ? "unknown"
            : "stale"
        : ((await this.backend.getStoreStatus()) as QueryStoreStatus);

    let explain: any = undefined;
    if (request.explain) {
      explain = {
        backend: backendUsed,
        executionPlan: ["Discovery", "Filter", "Sort", "Paginate"],
        indexesUsed: backendUsed === "sqlite" ? ["PRIMARY", "idx_artifacts_schema"] : [],
        filtersApplied: request.filters.map((f) => `${f.field} ${f.op} ${f.value}`),
        rowsRead: result.items.length,
        scannedFiles: result.annotations.filesScanned || 0,
        freshness,
        warnings:
          freshness === "stale"
            ? [
                `The query projection is STALE (${projection?.reason ?? "it does not match the workspace"}); this answer came from it because sqlite was requested. Run 'hardkas query store rebuild'.`
              ]
            : []
      };
    }

    return {
      ...result,
      explain,
      annotations: {
        ...result.annotations,
        backendUsed,
        freshness,
        ...(projection ? { projection: { ...projection, used: backendUsed === "sqlite" } } : {})
      }
    } as QueryResult<T>;
  }

  /**
   * List available domains and their operations.
   */
  listCapabilities(): Array<{
    domain: QueryDomain;
    ops: readonly string[];
    filters: readonly string[];
  }> {
    const result: Array<{
      domain: QueryDomain;
      ops: readonly string[];
      filters: readonly string[];
    }> = [];
    for (const [domain, adapter] of this.adapters.entries()) {
      result.push({
        domain,
        ops: adapter.supportedOps(),
        filters: adapter.supportedFilters()
      });
    }
    return result;
  }
}

/**
 * Creates a default QueryRequest with sensible defaults.
 */
export function createQueryRequest(
  overrides: Partial<QueryRequest> & { domain: QueryDomain; op: string }
): QueryRequest {
  return {
    domain: overrides.domain,
    op: overrides.op,
    filters: overrides.filters ?? [],
    sort: overrides.sort,
    limit: overrides.limit ?? 100,
    offset: overrides.offset ?? 0,
    explain: overrides.explain ?? false,
    params: overrides.params ?? {}
  };
}
