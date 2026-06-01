import { Hardkas } from "./index.js";
import { QueryEngine, createQueryRequest } from "@hardkas/query";
import type { EventEnvelope } from "@hardkas/core";

/**
 * HardKAS Operational Query Module
 *
 * Note: readEvents, correlate, and correlation types were removed from
 * @hardkas/query. These will be re-implemented when the query API stabilizes.
 * @alpha
 */
export class HardkasQuery {
  private _engine: QueryEngine | null = null;

  constructor(private sdk: Hardkas) {}

  /**
   * Internal lazy-loaded query engine.
   */
  private async getEngine(): Promise<QueryEngine> {
    if (this._engine) return this._engine;

    const { QueryEngine } = await import("@hardkas/query");
    this._engine = await QueryEngine.create({
      artifactDir: this.sdk.workspace.root,
      autoSync: false // We don't auto-sync on every getter
    });
    return this._engine;
  }

  /**
   * Synchronizes the query store with the filesystem artifacts.
   */
  async sync(options?: { force?: boolean }): Promise<any> {
    const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
    const { withLock } = await import("@hardkas/core");
    const path = await import("node:path");
    
    const dbPath = path.join(this.sdk.workspace.root, ".hardkas", "store.db");
    const store = new HardkasStore({ dbPath });
    
    let stats: any;
    await withLock(
      {
        rootDir: this.sdk.workspace.root,
        name: "query-store",
        command: "query-sync",
        wait: true
      },
      async () => {
        store.connect({ autoMigrate: true });
        const indexer = new HardkasIndexer(store.getDatabase());
        if (options?.force) {
           stats = await indexer.rebuild();
        } else {
           stats = await indexer.sync();
        }
      }
    );
    return stats;
  }

  /**
   * Fetches events from the query store.
   */
  async events(filter?: { domain?: string; kind?: string; correlationId?: string; artifactId?: string }): Promise<readonly EventEnvelope[]> {
    const engine = await this.getEngine();
    const { createQueryRequest } = await import("@hardkas/query");
    
    const filters = [];
    if (filter) {
      for (const [k, v] of Object.entries(filter)) {
        if (v) filters.push({ field: k, op: "eq", value: v });
      }
    }
    
    const request = createQueryRequest({
      domain: "events",
      op: "list",
      filters: filters as any
    });
    const result = await engine.execute(request);
    return result.items as readonly EventEnvelope[];
  }
}
