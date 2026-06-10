import type { Hardkas } from "./index.js";

/**
 * HardKAS Lineage Module
 * @alpha
 */
export class HardkasLineage {
  constructor(private sdk: Hardkas) {}

  /**
   * Traces the lineage of an artifact, identifying ancestors and descendants.
   */
  async trace(
    target: string | { artifactId?: string; contentHash?: string },
    options?: { direction?: "ancestors" | "descendants" }
  ): Promise<any> {
    const anchor =
      typeof target === "string" ? target : target.artifactId || target.contentHash || "";
    if (!anchor) throw new Error("No anchor target provided for lineage trace.");

    const { createQueryRequest, QueryEngine } = await import("@hardkas/query");

    // Lazy initialize query engine for lineage
    const engine = await QueryEngine.create({
      artifactDir: this.sdk.workspace.root,
      autoSync: false
    });

    const request = createQueryRequest({
      domain: "lineage",
      op: "chain",
      params: { anchor, direction: options?.direction || "ancestors" }
    });

    const result = await engine.execute(request);

    // The query store returns { anchor, direction, nodes, transitions, complete }
    return result.items[0];
  }
}
