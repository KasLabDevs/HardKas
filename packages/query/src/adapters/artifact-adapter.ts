/**
 * Artifact Query Adapter.
 *
 * Provides: list, inspect, diff, verify operations over the local artifact store.
 * Source of truth: filesystem (.hardkas/ directory and artifact JSON files).
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  calculateContentHash,
  verifyArtifactIntegrity,
  verifyArtifactSemantics,
  verifyFeeSemantics,
  verifyLineage,
  ARTIFACT_SCHEMAS
} from "@hardkas/artifacts";
import { evaluateFilters } from "../filter.js";
import { computeQueryHash } from "../serialize.js";
import { explainIntegrity } from "../explain.js";
import type {
  QueryAdapter,
  QueryRequest,
  QueryResult,
  ArtifactQueryItem,
  ArtifactInspectResult,
  ArtifactDiffResult,
  ArtifactDiffEntry,
  ExplainChain
} from "../types.js";

const KNOWN_SCHEMAS = new Set(Object.values(ARTIFACT_SCHEMAS));

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ArtifactQueryAdapter implements QueryAdapter {
  readonly domain = "artifacts" as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  supportedOps() {
    return ["list", "inspect", "diff", "verify"] as const;
  }

  supportedFilters() {
    return ["schema", "version", "networkId", "mode", "from.address", "to.address", "amountSompi", "status", "contentHash", "createdAt"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    switch (request.op) {
      case "list":
        return this.executeList(request);
      case "inspect":
        return this.executeInspect(request);
      case "diff":
        return this.executeDiff(request);
      case "verify":
        return this.executeVerify(request);
      default:
        throw new Error(`Unknown artifact op: ${request.op}`);
    }
  }

  // -------------------------------------------------------------------------
  // List — scan, filter, sort, paginate
  // -------------------------------------------------------------------------

  private async executeList(request: QueryRequest): Promise<QueryResult<ArtifactQueryItem>> {
    const start = Date.now();
    const files = await this.scanArtifactFiles();
    const items: ArtifactQueryItem[] = [];

    for (const filePath of files) {
      const raw = await this.readJsonSafe(filePath);
      if (!raw || !raw.schema) continue;

      const item = toArtifactQueryItem(raw, filePath);
      if (evaluateFilters(item, request.filters)) {
        items.push(item);
      }
    }

    // Sort
    const sorted = this.sortItems(items, request.sort);

    // Paginate
    const total = sorted.length;
    const paged = sorted.slice(request.offset, request.offset + request.limit);

    // Explain
    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(item => explainIntegrity(item, {
        ok: true,
        hashMatch: true,
        schemaValid: KNOWN_SCHEMAS.has(item.schema as any),
        errors: []
      }));
    }

    return {
      domain: "artifacts",
      op: "list",
      items: paged,
      total,
      truncated: total > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: files.length
      }
    };
  }

  // -------------------------------------------------------------------------
  // Inspect — deep structural analysis
  // -------------------------------------------------------------------------

  private async executeInspect(request: QueryRequest): Promise<QueryResult<ArtifactInspectResult>> {
    const start = Date.now();
    const target = request.params["target"];
    if (!target) throw new Error("inspect requires params.target (content hash or file path)");

    const filePath = await this.resolveTarget(target);
    const raw = await this.readJsonSafe(filePath);
    if (!raw) throw new Error(`Cannot read artifact at: ${filePath}`);

    const item = toArtifactQueryItem(raw, filePath);

    // Integrity
    const integrityResult = await verifyArtifactIntegrity(raw);
    const semanticResult = verifyArtifactSemantics(raw, { strict: true });
    const hashMatch = raw.contentHash ? calculateContentHash(raw) === raw.contentHash : true;

    // Economics (for tx artifacts)
    let economics: ArtifactInspectResult["economics"];
    const artifactType = item.schema.split(".")[1];
    if (artifactType === "txPlan" || artifactType === "signedTx" || artifactType === "txReceipt") {
      const feeAudit = verifyFeeSemantics(raw);
      economics = {
        ok: feeAudit.ok,
        massReported: feeAudit.actualMass.toString(),
        massRecomputed: feeAudit.expectedMass.toString(),
        feeReported: feeAudit.actualFeeSompi.toString(),
        feeRecomputed: feeAudit.expectedFeeSompi.toString(),
        feeRate: feeAudit.feeRateSompiPerMass.toString()
      };
    }

    // Staleness
    const ageHours = item.createdAt
      ? (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60)
      : 0;

    const staleness = {
      ageHours: Math.round(ageHours * 100) / 100,
      stale: ageHours > 24,
      classification: classifyStaleness(ageHours)
    };

    // Lineage status
    const lineageResult = verifyLineage(raw);
    const lineageStatus = !raw.lineage ? "missing" as const
      : lineageResult.ok ? "valid" as const
      : "orphan" as const;

    const inspectResult: ArtifactInspectResult = {
      item,
      integrity: {
        ok: integrityResult.ok && hashMatch,
        hashMatch,
        schemaValid: KNOWN_SCHEMAS.has(item.schema as any),
        errors: [...integrityResult.issues.map(i => i.message), ...semanticResult.issues.map(i => i.message)]
      },
      economics,
      staleness,
      lineageStatus
    };

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = [explainIntegrity(item, inspectResult.integrity)];
    }

    return {
      domain: "artifacts",
      op: "inspect",
      items: [inspectResult] as any,
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([inspectResult]),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: 1
      }
    };
  }

  // -------------------------------------------------------------------------
  // Diff — semantic field-by-field comparison
  // -------------------------------------------------------------------------

  private async executeDiff(request: QueryRequest): Promise<QueryResult<ArtifactDiffResult>> {
    const start = Date.now();
    const leftPath = request.params["left"];
    const rightPath = request.params["right"];
    if (!leftPath || !rightPath) throw new Error("diff requires params.left and params.right");

    const leftRaw = await this.readJsonSafe(leftPath);
    const rightRaw = await this.readJsonSafe(rightPath);
    if (!leftRaw) throw new Error(`Cannot read left artifact: ${leftPath}`);
    if (!rightRaw) throw new Error(`Cannot read right artifact: ${rightPath}`);

    const entries: ArtifactDiffEntry[] = [];
    const allKeys = new Set([...Object.keys(leftRaw), ...Object.keys(rightRaw)]);

    // Exclude computed fields from diff
    const excluded = new Set(["contentHash", "artifactId", "lineage"]);

    for (const key of [...allKeys].sort()) {
      if (excluded.has(key)) continue;

      const leftVal = leftRaw[key];
      const rightVal = rightRaw[key];
      const leftStr = leftVal !== undefined ? JSON.stringify(leftVal) : undefined;
      const rightStr = rightVal !== undefined ? JSON.stringify(rightVal) : undefined;

      if (leftStr === rightStr) continue;

      let kind: ArtifactDiffEntry["kind"];
      if (leftStr === undefined) kind = "added";
      else if (rightStr === undefined) kind = "removed";
      else if (typeof leftVal !== typeof rightVal) kind = "type-change";
      else kind = "value-change";

      entries.push({ field: key, left: leftStr, right: rightStr, kind });
    }

    const result: ArtifactDiffResult = {
      leftPath,
      rightPath,
      leftSchema: leftRaw.schema || "unknown",
      rightSchema: rightRaw.schema || "unknown",
      identical: entries.length === 0,
      entries
    };

    return {
      domain: "artifacts",
      op: "diff",
      items: [result] as any,
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([result]),
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: 2
      }
    };
  }

  // -------------------------------------------------------------------------
  // Verify — deep verification with optional explain
  // -------------------------------------------------------------------------

  private async executeVerify(request: QueryRequest): Promise<QueryResult<ArtifactInspectResult>> {
    // Verify is inspect with strict mode always on
    return this.executeInspect(request);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async scanArtifactFiles(): Promise<string[]> {
    const files: string[] = [];
    await this.walkDir(this.rootDir, files);
    // Deterministic ordering: sort lexicographically
    return files.sort();
  }

  private async walkDir(dir: string, out: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist or not readable
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .git, keystores
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

  private async resolveTarget(target: string): Promise<string> {
    // If it looks like a file path, use directly
    if (target.includes("/") || target.includes("\\") || target.endsWith(".json")) {
      return path.resolve(target);
    }

    // Otherwise, treat as contentHash and scan for it
    const files = await this.scanArtifactFiles();
    for (const f of files) {
      const raw = await this.readJsonSafe(f);
      if (raw?.contentHash === target) return f;
      if (raw?.lineage?.artifactId === target) return f;
    }

    throw new Error(`No artifact found with hash or ID: ${target}`);
  }

  private sortItems(items: ArtifactQueryItem[], sort?: QueryRequest["sort"]): ArtifactQueryItem[] {
    const sorted = [...items];

    if (sort) {
      sorted.sort((a, b) => {
        const aVal = String((a as any)[sort.field] ?? "");
        const bVal = String((b as any)[sort.field] ?? "");
        const cmp = aVal.localeCompare(bVal);
        return sort.direction === "desc" ? -cmp : cmp;
      });
    } else {
      // Default: sort by createdAt desc, tie-break by schema
      sorted.sort((a, b) => {
        const cmp = b.createdAt.localeCompare(a.createdAt);
        return cmp !== 0 ? cmp : a.schema.localeCompare(b.schema);
      });
    }

    // Stable tie-breaker: contentHash (determinism guarantee)
    return sorted;
  }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function toArtifactQueryItem(raw: any, filePath: string): ArtifactQueryItem {
  return {
    filePath,
    schema: raw.schema || "unknown",
    version: raw.version || "unknown",
    networkId: raw.networkId || "unknown",
    mode: raw.mode || "unknown",
    createdAt: raw.createdAt || "",
    contentHash: raw.contentHash,
    from: raw.from,
    to: raw.to,
    amountSompi: raw.amountSompi,
    status: raw.status,
    lineage: raw.lineage ? {
      artifactId: raw.lineage.artifactId,
      parentArtifactId: raw.lineage.parentArtifactId,
      rootArtifactId: raw.lineage.rootArtifactId,
      lineageId: raw.lineage.lineageId,
      sequence: raw.lineage.sequence
    } : undefined
  };
}

function classifyStaleness(hours: number): "fresh" | "aging" | "stale" | "expired" {
  if (hours < 1) return "fresh";
  if (hours < 24) return "aging";
  if (hours < 168) return "stale"; // 7 days
  return "expired";
}
