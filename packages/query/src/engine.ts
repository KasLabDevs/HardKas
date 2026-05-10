/**
 * Query Engine — orchestrates adapter selection and pipeline execution.
 *
 * Pipeline: Source → Scan → Filter → Sort → Paginate → Explain → Serialize
 *
 * All execution is deterministic over the input artifact store.
 */
import { ArtifactQueryAdapter } from "./adapters/artifact-adapter.js";
import { LineageQueryAdapter } from "./adapters/lineage-adapter.js";
import { ReplayQueryAdapter } from "./adapters/replay-adapter.js";
import { DagQueryAdapter } from "./adapters/dag-adapter.js";
import { EventsQueryAdapter } from "./adapters/events-adapter.js";
import { TxQueryAdapter } from "./adapters/tx-adapter.js";
import type { QueryAdapter, QueryDomain, QueryRequest, QueryResult } from "./types.js";

export interface QueryEngineOptions {
  /** Root directory for artifact/lineage scanning (typically .hardkas/ or project root). */
  readonly artifactDir: string;
}

export class QueryEngine {
  private readonly adapters: Map<QueryDomain, QueryAdapter>;

  constructor(options: QueryEngineOptions) {
    this.adapters = new Map();
    this.adapters.set("artifacts", new ArtifactQueryAdapter(options.artifactDir));
    this.adapters.set("lineage", new LineageQueryAdapter(options.artifactDir));
    this.adapters.set("replay", new ReplayQueryAdapter(options.artifactDir));
    this.adapters.set("dag", new DagQueryAdapter(options.artifactDir));
    this.adapters.set("events", new EventsQueryAdapter(options.artifactDir));
    this.adapters.set("tx", new TxQueryAdapter(options.artifactDir));
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

    return adapter.execute(request) as Promise<QueryResult<T>>;
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
