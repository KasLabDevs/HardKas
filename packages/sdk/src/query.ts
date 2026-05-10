import { Hardkas } from "./index.js";
import { 
  QueryEngine, 
  createQueryRequest
} from "@hardkas/query";

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
    this._engine = new QueryEngine({
      artifactDir: this.sdk.config.cwd
    });
    return this._engine;
  }
}
