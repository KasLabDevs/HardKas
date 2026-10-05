/**
 * Artifact Query Adapter.
 *
 * Provides: list, inspect, diff, verify operations over the local artifact store.
 * Source of truth: filesystem (.hardkas/ directory and artifact JSON files).
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  recomputeDeclaredContentHash,
  readDeclaredHashVersion,
  isAuthenticatedPath,
  resolveParentReference,
  verifyArtifactIntegrity,
  verifyArtifactSemantics,
  verifyFeeSemantics,
  verifyLineage,
  ARTIFACT_SCHEMAS,
  CURRENT_HASH_VERSION
} from "@hardkas/artifacts";
import { isSecretFieldName, redactUrlCredentialsInText } from "@hardkas/core";
import { evaluateFilters } from "../filter.js";
import { computeQueryHash } from "../serialize.js";
import { paginateAndFormatResult } from "../format.js";
import { explainIntegrity } from "../explain.js";
import type {
  QueryAdapter,
  QueryRequest,
  QueryResult,
  ArtifactQueryItem,
  ArtifactInspectResult,
  ArtifactDiffResult,
  ArtifactDiffEntry,
  ExplainBlock,
  WhyBlock
} from "../types.js";
import type { QueryBackend } from "../backend.js";
import { type ContentHash } from "@hardkas/core";

const KNOWN_SCHEMAS = new Set(Object.values(ARTIFACT_SCHEMAS));

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ArtifactQueryAdapter implements QueryAdapter {
  readonly domain = "artifacts" as const;
  private readonly rootDir: string;
  private readonly backend: QueryBackend;

  constructor(rootDir: string, backend: QueryBackend) {
    this.rootDir = rootDir;
    this.backend = backend;
  }

  supportedOps() {
    return ["list", "inspect", "diff", "verify"] as const;
  }

  supportedFilters() {
    return [
      "schema",
      "version",
      "networkId",
      "mode",
      "from.address",
      "to.address",
      "amountSompi",
      "status",
      "contentHash",
      "createdAt"
    ] as const;
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

  private async executeList(
    request: QueryRequest
  ): Promise<QueryResult<ArtifactQueryItem>> {
    const start = Date.now();

    // Use backend for primary discovery
    const docs = await this.backend.findArtifacts();
    const items: ArtifactQueryItem[] = [];

    for (const doc of docs) {
      const item: ArtifactQueryItem = {
        filePath: doc.path,
        schema: doc.schema,
        version: doc.version,
        networkId: doc.networkId,
        mode: doc.mode,
        createdAt: doc.createdAt,
        contentHash: doc.contentHash as ContentHash,
        payload: doc.payload,
        // Optional mapping for common fields
        status: doc.payload.status,
        from: doc.payload.from,
        to: doc.payload.to,
        amountSompi: doc.payload.amountSompi,
        lineage: doc.payload.lineage
      };

      if (evaluateFilters(item, request.filters)) {
        items.push(item);
      }
    }

    // Sort
    const sorted = this.sortItems(items, request.sort);

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      const pagedForWhy = sorted.slice(
        request.offset ?? 0,
        (request.offset ?? 0) + (request.limit ?? sorted.length)
      );
      why = pagedForWhy.map((item) =>
        explainIntegrity(item, {
          ok: true,
          hashMatch: true,
          schemaValid: KNOWN_SCHEMAS.has(
            item.schema as (typeof ARTIFACT_SCHEMAS)[keyof typeof ARTIFACT_SCHEMAS]
          ),
          errors: []
        })
      );
    }

    return paginateAndFormatResult({
      request,
      items: sorted,
      domain: "artifacts",
      op: "list",
      deterministic: true,
      why,
      annotations: {
        executionMs: Date.now() - start,
        filesScanned: docs.length
      }
    });
  }

  // -------------------------------------------------------------------------
  // Inspect — deep structural analysis
  // -------------------------------------------------------------------------

  private async executeInspect(
    request: QueryRequest
  ): Promise<QueryResult<ArtifactInspectResult>> {
    const start = Date.now();
    const target = request.params["target"];
    if (!target)
      throw new Error("inspect requires params.target (content hash or file path)");

    const filePath = await this.resolveTarget(target);
    const raw = await this.readJsonSafe(filePath);
    if (!raw) throw new Error(`Cannot read artifact at: ${filePath}`);

    const item = toArtifactQueryItem(raw, filePath);

    // Integrity. EVIDENCE-TRUST-1 (ET-C2): references are looked up in the workspace store this engine serves, as
    // `hardkas verify` does — a parent is never "not found in workspace" without the workspace being searched.
    const integrityResult = await verifyArtifactIntegrity(raw, { workspaceRoot: this.rootDir });
    const semanticResult = verifyArtifactSemantics(raw, { strict: true, workspaceRoot: this.rootDir });
    const parent = resolveParentReference(raw, { workspaceRoot: this.rootDir });
    let hashMatch = true;
    if (raw.contentHash) {
      try {
        hashMatch = recomputeDeclaredContentHash(raw) === raw.contentHash;
      } catch {
        hashMatch = false; // invalid or missing hashVersion: no identity can be established
      }
    }

    // Economics (for tx artifacts)
    let economics: ArtifactInspectResult["economics"];
    const artifactType = item.schema.split(".")[1];
    if (
      artifactType === "txPlan" ||
      artifactType === "signedTx" ||
      artifactType === "txReceipt"
    ) {
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

    // Lineage status: the structure AND the parent as found in the workspace store (EVIDENCE-TRUST-1).
    const lineageResult = verifyLineage(raw);
    const lineageStatus = !raw.lineage
      ? ("missing" as const)
      : lineageResult.ok && (parent.status === "resolved" || parent.status === "root")
        ? ("valid" as const)
        : ("orphan" as const);

    const inspectResult: ArtifactInspectResult = {
      item,
      integrity: {
        ok: integrityResult.ok && hashMatch,
        hashMatch,
        schemaValid: KNOWN_SCHEMAS.has(
          item.schema as (typeof ARTIFACT_SCHEMAS)[keyof typeof ARTIFACT_SCHEMAS]
        ),
        errors: [
          ...integrityResult.issues.map((i) => i.message),
          ...semanticResult.issues.map((i) => i.message)
        ]
      },
      economics,
      staleness,
      lineageStatus,
      parent: {
        status: parent.status,
        ...(parent.artifactId ? { artifactId: parent.artifactId } : {}),
        ...(parent.detail ? { detail: parent.detail } : {})
      }
    };

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = [explainIntegrity(item, inspectResult.integrity)];
    }

    return {
      domain: "artifacts",
      op: "inspect",
      items: [inspectResult],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([inspectResult]),
      why,
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

  private async executeDiff(
    request: QueryRequest
  ): Promise<QueryResult<ArtifactDiffResult>> {
    const start = Date.now();
    const leftPath = request.params["left"];
    const rightPath = request.params["right"];
    if (!leftPath || !rightPath)
      throw new Error("diff requires params.left and params.right");

    const leftRaw = await this.readJsonSafe(leftPath);
    const rightRaw = await this.readJsonSafe(rightPath);
    if (!leftRaw) throw new Error(`Cannot read left artifact: ${leftPath}`);
    if (!rightRaw) throw new Error(`Cannot read right artifact: ${rightPath}`);

    // EVIDENCE-TRUST-1 (ET-C3): the comparison of two pieces of evidence decides on their RAW values, every field
    // included — `lineage`, `artifactId` and `contentHash` too (lineage is authenticated under hash version 5). Each
    // difference says whether the content hash covers it; `sameIdentity` compares the recomputed identities. This is not
    // the replay comparison (diffArtifacts), whose exclusions are deliberate for replay.
    const versions = [readDeclaredHashVersion(leftRaw), readDeclaredHashVersion(rightRaw)].filter(
      (v): v is number => v !== null
    );
    const entries: ArtifactDiffEntry[] = [];
    diffEvidence(leftRaw, rightRaw, [], "", entries, versions.length > 0 ? versions : [CURRENT_HASH_VERSION], false);
    const identityOf = (a: unknown): string | null => {
      try {
        return recomputeDeclaredContentHash(a);
      } catch {
        return null;
      }
    };
    const leftIdentity = identityOf(leftRaw);
    const rightIdentity = identityOf(rightRaw);

    const result: ArtifactDiffResult = {
      leftPath,
      rightPath,
      leftSchema: leftRaw.schema || "unknown",
      rightSchema: rightRaw.schema || "unknown",
      identical: entries.length === 0,
      sameIdentity: leftIdentity !== null && leftIdentity === rightIdentity,
      leftIdentity,
      rightIdentity,
      entries
    };

    return {
      domain: "artifacts",
      op: "diff",
      items: [result],
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

  private async executeVerify(
    request: QueryRequest
  ): Promise<QueryResult<ArtifactInspectResult>> {
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
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "keystores"
        )
          continue;
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

  private sortItems(
    items: ArtifactQueryItem[],
    sort?: QueryRequest["sort"]
  ): ArtifactQueryItem[] {
    const sorted = [...items];

    if (sort) {
      sorted.sort((a, b) => {
        const aVal = String((a as unknown as Record<string, unknown>)[sort.field] ?? "");
        const bVal = String((b as unknown as Record<string, unknown>)[sort.field] ?? "");
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === "desc" ? -cmp : cmp;
      });
    } else {
      // Default: sort by createdAt desc, tie-break by schema
      sorted.sort((a, b) => {
        const dateA = b.createdAt ?? "";
        const dateB = a.createdAt ?? "";
        const cmp = dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
        if (cmp !== 0) return cmp;
        return a.schema < b.schema ? -1 : a.schema > b.schema ? 1 : 0;
      });
    }

    // Stable tie-breaker: contentHash (determinism guarantee)
    return sorted;
  }
}

// ---------------------------------------------------------------------------
// Evidence diff (EVIDENCE-TRUST-1, ET-C3)
// ---------------------------------------------------------------------------

/** A field named as a secret, compared without case and without "_" or "-". */
const isSecretName = (key: string) => isSecretFieldName(key.toLowerCase().replace(/[_-]/g, ""));

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const typeName = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function holdsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsSecretField);
  if (!isPlainObject(value)) return false;
  return Object.keys(value).some((k) => isSecretName(k) || holdsSecretField(value[k]));
}

/** A value as shown in a difference: its strings with URL credentials redacted (the raw values were compared). */
function shown(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const redact = (v: unknown): unknown =>
    typeof v === "string"
      ? redactUrlCredentialsInText(v)
      : Array.isArray(v)
        ? v.map(redact)
        : isPlainObject(v)
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x)]))
          : v;
  return JSON.stringify(redact(value));
}

/**
 * Records every difference between two JSON values, path by path, deciding on the raw values. A difference inside a
 * field named as a secret carries no values; values holding URL credentials are shown redacted.
 */
function diffEvidence(
  left: unknown,
  right: unknown,
  canonicalPath: Array<string | null>,
  displayPath: string,
  entries: ArtifactDiffEntry[],
  versions: number[],
  inSecret: boolean
): void {
  if (left === right) return;
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      diffEvidence(
        left[key],
        right[key],
        [...canonicalPath, key],
        displayPath ? `${displayPath}.${key}` : key,
        entries,
        versions,
        inSecret || isSecretName(key)
      );
    }
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) {
      diffEvidence(left[i], right[i], [...canonicalPath, null], `${displayPath}[${i}]`, entries, versions, inSecret);
    }
    return;
  }
  if (typeName(left) === typeName(right) && JSON.stringify(left) === JSON.stringify(right)) return;
  const kind: ArtifactDiffEntry["kind"] =
    left === undefined ? "added" : right === undefined ? "removed" : typeName(left) !== typeName(right) ? "type-change" : "value-change";
  const authenticated = versions.some((v) => isAuthenticatedPath(canonicalPath, v));
  if (inSecret || holdsSecretField(left) || holdsSecretField(right)) {
    entries.push({ field: displayPath, left: undefined, right: undefined, kind, authenticated, secret: true });
    return;
  }
  const l = shown(left);
  const r = shown(right);
  const redacted =
    (left !== undefined && l !== JSON.stringify(left)) || (right !== undefined && r !== JSON.stringify(right));
  entries.push({ field: displayPath, left: l, right: r, kind, authenticated, ...(redacted ? { redacted: true as const } : {}) });
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
    contentHash: raw.contentHash as ContentHash,
    payload: raw,
    from: raw.from,
    to: raw.to,
    amountSompi: raw.amountSompi,
    status: raw.status,
    lineage: raw.lineage
      ? {
          artifactId: raw.lineage.artifactId,
          parentArtifactId: raw.lineage.parentArtifactId,
          rootArtifactId: raw.lineage.rootArtifactId,
          lineageId: raw.lineage.lineageId,
          sequence: raw.lineage.sequence
        }
      : undefined
  };
}

function classifyStaleness(hours: number): "fresh" | "aging" | "stale" | "expired" {
  if (hours < 1) return "fresh";
  if (hours < 24) return "aging";
  if (hours < 168) return "stale"; // 7 days
  return "expired";
}
