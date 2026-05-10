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
import fs from "node:fs";
import path from "node:path";

export interface QueryEngineOptions {
  /** Root directory for artifact/lineage scanning (typically .hardkas/ or project root). */
  readonly artifactDir: string;
  /** Primary data backend. If not provided, defaults to auto-discovery (SQLite > Filesystem). */
  readonly backend?: QueryBackend;
}

export class QueryEngine {
  private readonly adapters: Map<QueryDomain, QueryAdapter>;
  public readonly backend: QueryBackend;

  /**
   * Primary entry point for creating a QueryEngine with auto-discovery.
   */
  static async create(options: QueryEngineOptions): Promise<QueryEngine> {
    let backend = options.backend;

    if (!backend) {
      // Auto-discovery: SQLite > FS Fallback
      const dbPath = path.join(options.artifactDir, ".hardkas", "store.db");
      if (fs.existsSync(dbPath)) {
        try {
          const { HardkasStore, SqliteQueryBackend, HardkasIndexer } = await import("@hardkas/query-store");
          const store = new HardkasStore({ dbPath });
          store.connect();
          
          // Auto-sync if possible to maintain freshness
          const indexer = new HardkasIndexer(store.getDatabase());
          await indexer.sync();

          backend = new SqliteQueryBackend(store);
        } catch (e) {
          backend = new FilesystemQueryBackend(options.artifactDir);
        }
      } else {
        backend = new FilesystemQueryBackend(options.artifactDir);
      }
    }

    return new QueryEngine({ 
      artifactDir: options.artifactDir,
      backend: backend! 
    });
  }

  constructor(options: QueryEngineOptions) {
    this.backend = options.backend || new FilesystemQueryBackend(options.artifactDir);
    
    this.adapters = new Map();
    this.adapters.set("artifacts", new ArtifactQueryAdapter(options.artifactDir, this.backend));
    this.adapters.set("lineage", new LineageQueryAdapter(options.artifactDir, this.backend));
    this.adapters.set("replay", new ReplayQueryAdapter(options.artifactDir, this.backend));
    this.adapters.set("dag", new DagQueryAdapter(options.artifactDir, this.backend));
    this.adapters.set("events", new EventsQueryAdapter(options.artifactDir, this.backend));
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
    
    // Inject freshness and backend info into annotations
    const freshness = (await this.backend.getStoreStatus()) as any;
    const backendUsed = this.backend.kind();
    
    let explain: any = undefined;
    if (request.explain) {
      explain = {
        backend: backendUsed,
        executionPlan: ["Discovery", "Filter", "Sort", "Paginate"],
        indexesUsed: backendUsed === "sqlite" ? ["PRIMARY", "idx_artifacts_schema"] : [],
        filtersApplied: request.filters.map(f => `${f.field} ${f.op} ${f.value}`),
        rowsRead: result.items.length,
        scannedFiles: result.annotations.filesScanned || 0,
        freshness,
        warnings: freshness === "stale" ? ["Index is STALE. mtime mismatch detected. Run 'hardkas query store rebuild'."] : []
      };
    }
    
    return {
      ...result,
      explain,
      annotations: {
        ...result.annotations,
        backendUsed,
        freshness
      }
    } as QueryResult<T>;
  }

  /**
   * List available domains and their operations.
   */
  listCapabilities(): Array<{ domain: QueryDomain; ops: readonly string[]; filters: readonly string[] }> {
    const result: Array<{ domain: QueryDomain; ops: readonly string[]; filters: readonly string[] }> = [];
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
