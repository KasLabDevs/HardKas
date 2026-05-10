/**
 * Lineage Query Adapter.
 *
 * Builds an in-memory lineage graph from all artifacts in the store,
 * then provides: chain traversal, transition analysis, and orphan detection.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { computeQueryHash } from "../serialize.js";
import { explainTransition, explainOrphan } from "../explain.js";
import type {
  QueryAdapter,
  QueryRequest,
  QueryResult,
  LineageNode,
  LineageChainResult,
  LineageTransition,
  LineageOrphan,
  ExplainChain
} from "../types.js";

// Valid transitions from @hardkas/artifacts lineage.ts
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  "hardkas.snapshot": ["hardkas.txPlan"],
  "hardkas.txPlan": ["hardkas.signedTx"],
  "hardkas.signedTx": ["hardkas.txReceipt"]
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class LineageQueryAdapter implements QueryAdapter {
  readonly domain = "lineage" as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  supportedOps() {
    return ["chain", "transitions", "orphans"] as const;
  }

  supportedFilters() {
    return ["schema", "networkId", "mode", "rootArtifactId", "lineageId"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult<any>> {
    switch (request.op) {
      case "chain":
        return this.executeChain(request);
      case "transitions":
        return this.executeTransitions(request);
      case "orphans":
        return this.executeOrphans(request);
      default:
        throw new Error(`Unknown lineage op: ${request.op}`);
    }
  }

  // -------------------------------------------------------------------------
  // Chain — walk ancestors or descendants from an anchor
  // -------------------------------------------------------------------------

  private async executeChain(request: QueryRequest): Promise<QueryResult<LineageChainResult>> {
    const start = Date.now();
    const anchor = request.params["anchor"];
    if (!anchor) throw new Error("chain requires params.anchor (contentHash or artifactId)");

    const direction = (request.params["direction"] ?? "ancestors") as "ancestors" | "descendants";
    const graph = await this.buildGraph();

    // Find anchor node
    const anchorNode = graph.byArtifactId.get(anchor) ?? graph.byContentHash.get(anchor);
    if (!anchorNode) throw new Error(`Anchor not found: ${anchor}`);

    const nodes: LineageNode[] = [];
    const transitions: LineageTransition[] = [];

    if (direction === "ancestors") {
      this.walkAncestors(anchorNode, graph, nodes, transitions);
    } else {
      this.walkDescendants(anchorNode, graph, nodes, transitions);
    }

    const complete = direction === "ancestors"
      ? nodes.length > 0 && !nodes[0]!.parentArtifactId
      : true; // descendants are always "complete" (we show what exists)

    const result: LineageChainResult = {
      anchor,
      direction,
      nodes,
      transitions,
      complete
    };

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = transitions.map(t => explainTransition(t));
    }

    return {
      domain: "lineage",
      op: "chain",
      items: [result] as any,
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([result]),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: graph.totalFiles
      }
    };
  }

  // -------------------------------------------------------------------------
  // Transitions — list all edges in a lineage tree
  // -------------------------------------------------------------------------

  private async executeTransitions(request: QueryRequest): Promise<QueryResult<LineageTransition>> {
    const start = Date.now();
    const graph = await this.buildGraph();
    const rootId = request.params["root"];

    const transitions: LineageTransition[] = [];

    for (const node of graph.nodes) {
      if (!node.parentArtifactId) continue;
      if (rootId && node.rootArtifactId !== rootId) continue;

      const parent = graph.byArtifactId.get(node.parentArtifactId);
      if (!parent) continue;

      const allowed = VALID_TRANSITIONS[parent.schema] ?? [];
      const valid = allowed.includes(node.schema);

      transitions.push({
        from: parent,
        to: node,
        valid,
        rule: valid
          ? `${parent.schema} → ${node.schema} (valid)`
          : `${parent.schema} → ${node.schema} (INVALID — allowed: ${allowed.join(", ") || "none"})`
      });
    }

    // Sort deterministically by sequence then contentHash
    transitions.sort((a, b) => {
      const seqA = a.from.sequence ?? 0;
      const seqB = b.from.sequence ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return a.from.contentHash.localeCompare(b.from.contentHash);
    });

    const paged = transitions.slice(request.offset, request.offset + request.limit);

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(t => explainTransition(t));
    }

    return {
      domain: "lineage",
      op: "transitions",
      items: paged,
      total: transitions.length,
      truncated: transitions.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: graph.totalFiles
      }
    };
  }

  // -------------------------------------------------------------------------
  // Orphans — artifacts with broken parent references
  // -------------------------------------------------------------------------

  private async executeOrphans(request: QueryRequest): Promise<QueryResult<LineageOrphan>> {
    const start = Date.now();
    const graph = await this.buildGraph();
    const orphans: LineageOrphan[] = [];

    for (const node of graph.nodes) {
      if (!node.parentArtifactId) continue;

      const parent = graph.byArtifactId.get(node.parentArtifactId);
      if (!parent) {
        orphans.push({
          node,
          missingParentId: node.parentArtifactId,
          reason: `Parent artifactId "${node.parentArtifactId}" not found in artifact store`
        });
      }
    }

    // Sort by contentHash for determinism
    orphans.sort((a, b) => a.node.contentHash.localeCompare(b.node.contentHash));

    const paged = orphans.slice(request.offset, request.offset + request.limit);

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(o => explainOrphan(o.node, o.missingParentId));
    }

    return {
      domain: "lineage",
      op: "orphans",
      items: paged,
      total: orphans.length,
      truncated: orphans.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: graph.totalFiles
      }
    };
  }

  // -------------------------------------------------------------------------
  // Graph Construction
  // -------------------------------------------------------------------------

  private async buildGraph(): Promise<LineageGraph> {
    const nodes: LineageNode[] = [];
    const byArtifactId = new Map<string, LineageNode>();
    const byContentHash = new Map<string, LineageNode>();
    const children = new Map<string, LineageNode[]>(); // parentId -> children

    const files = await this.scanJsonFiles();

    for (const filePath of files) {
      const raw = await this.readJsonSafe(filePath);
      if (!raw?.schema || !raw.lineage) continue;

      const node: LineageNode = {
        contentHash: raw.contentHash || "",
        schema: raw.schema,
        artifactId: raw.lineage.artifactId || "",
        parentArtifactId: raw.lineage.parentArtifactId,
        rootArtifactId: raw.lineage.rootArtifactId || "",
        lineageId: raw.lineage.lineageId || "",
        sequence: raw.lineage.sequence,
        filePath,
        networkId: raw.networkId || "unknown",
        mode: raw.mode || "unknown",
        createdAt: raw.createdAt || ""
      };

      nodes.push(node);
      if (node.artifactId) byArtifactId.set(node.artifactId, node);
      if (node.contentHash) byContentHash.set(node.contentHash, node);

      if (node.parentArtifactId) {
        const existing = children.get(node.parentArtifactId) ?? [];
        existing.push(node);
        children.set(node.parentArtifactId, existing);
      }
    }

    return { nodes, byArtifactId, byContentHash, children, totalFiles: files.length };
  }

  // -------------------------------------------------------------------------
  // Graph Traversal
  // -------------------------------------------------------------------------

  private walkAncestors(
    node: LineageNode,
    graph: LineageGraph,
    nodes: LineageNode[],
    transitions: LineageTransition[]
  ): void {
    // Walk from node toward root
    const chain: LineageNode[] = [node];
    let current = node;
    const visited = new Set<string>();

    while (current.parentArtifactId && !visited.has(current.parentArtifactId)) {
      visited.add(current.parentArtifactId);
      const parent = graph.byArtifactId.get(current.parentArtifactId);
      if (!parent) break;

      chain.unshift(parent);

      const allowed = VALID_TRANSITIONS[parent.schema] ?? [];
      transitions.unshift({
        from: parent,
        to: current,
        valid: allowed.includes(current.schema),
        rule: allowed.includes(current.schema)
          ? `${parent.schema} → ${current.schema} (valid)`
          : `${parent.schema} → ${current.schema} (INVALID)`
      });

      current = parent;
    }

    nodes.push(...chain);
  }

  private walkDescendants(
    node: LineageNode,
    graph: LineageGraph,
    nodes: LineageNode[],
    transitions: LineageTransition[]
  ): void {
    // BFS from node toward leaves
    const queue: LineageNode[] = [node];
    const visited = new Set<string>();
    nodes.push(node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.artifactId)) continue;
      visited.add(current.artifactId);

      const kids = graph.children.get(current.artifactId) ?? [];
      for (const child of kids) {
        nodes.push(child);
        queue.push(child);

        const allowed = VALID_TRANSITIONS[current.schema] ?? [];
        transitions.push({
          from: current,
          to: child,
          valid: allowed.includes(child.schema),
          rule: allowed.includes(child.schema)
            ? `${current.schema} → ${child.schema} (valid)`
            : `${current.schema} → ${child.schema} (INVALID)`
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Filesystem
  // -------------------------------------------------------------------------

  private async scanJsonFiles(): Promise<string[]> {
    const files: string[] = [];
    await this.walkDir(this.rootDir, files);
    return files.sort();
  }

  private async walkDir(dir: string, out: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "keystores") continue;
        await this.walkDir(full, out);
      } else if (entry.name.endsWith(".json") && !entry.name.endsWith(".enc.json")) {
        out.push(full);
      }
    }
  }

  private async readJsonSafe(filePath: string): Promise<any | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal graph type
// ---------------------------------------------------------------------------

interface LineageGraph {
  nodes: LineageNode[];
  byArtifactId: Map<string, LineageNode>;
  byContentHash: Map<string, LineageNode>;
  children: Map<string, LineageNode[]>;
  totalFiles: number;
}
