/**
 * Transaction Aggregation Adapter.
 *
 * Aggregates artifacts + events + lineage for a given txId.
 * Partial results are returned with explicit warnings when data is incomplete.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { validateEventEnvelope, HardkasSchemas } from "@hardkas/core";
import { checkArtifactIdentity, compareStoreCopies, parentReferenceOf, TX_NAMESPACE_SCHEMAS } from "@hardkas/artifacts";
import { computeQueryHash } from "../serialize.js";
import { paginateAndFormatResult } from "../format.js";
import type { QueryAdapter, QueryRequest, QueryResult, WhyBlock } from "../types.js";
import type { QueryBackend } from "../backend.js";
import { deterministicCompare } from "@hardkas/core";

/** WORKSPACE-AUTHORITY-1 (D): an artifact's role in a transaction comes from its exact schema, never a substring. */
const ROLE_BY_SCHEMA: Readonly<Record<string, string>> = {
  [HardkasSchemas.TxPlan]: "plan",
  [HardkasSchemas.TxPlanV1]: "plan",
  [HardkasSchemas.TxPlanV2]: "plan",
  [HardkasSchemas.TxPlanV3]: "plan",
  [HardkasSchemas.SignedTx]: "signed",
  [HardkasSchemas.SignedTxV1]: "signed",
  [HardkasSchemas.SignedTxV2]: "signed",
  [HardkasSchemas.SignedTxV3]: "signed",
  [HardkasSchemas.TxReceipt]: "receipt",
  [HardkasSchemas.TxReceiptV1]: "receipt",
  [HardkasSchemas.TxReceiptV2]: "receipt",
  [HardkasSchemas.TxReceiptV3]: "receipt",
  [HardkasSchemas.TxSubmissionV1]: "submission",
  [HardkasSchemas.TxObservationV1]: "observation",
  [HardkasSchemas.TxTrace]: "trace",
  [HardkasSchemas.TxTraceV1]: "trace",
  [HardkasSchemas.ReplayReportV1]: "replay"
};

/** An artifact reached through the transaction's authenticated lineage whose schema has no tx role of its own. */
const roleOf = (schema: string): string => ROLE_BY_SCHEMA[schema] ?? "related";

/** One copy per identity: the store's own rule (a canonical subdirectory's copy before a store-root copy, then by path). */
function preferredCopy<T extends { doc: { path: string } }>(copies: readonly T[]): T {
  return [...copies].sort((a, b) => compareStoreCopies(a.doc.path, b.doc.path))[0]!;
}

interface TxAggregation {
  readonly txId: string;
  readonly artifacts: readonly TxArtifactRef[];
  readonly events: readonly TxEventRef[];
  readonly warnings: readonly string[];
  readonly complete: boolean;
}

interface TxArtifactRef {
  readonly filePath: string;
  readonly schema: string;
  readonly contentHash?: string;
  readonly role: string; // "plan" | "signed" | "receipt" | "unknown"
}

interface TxEventRef {
  readonly eventId: string;
  readonly kind: string;
  readonly timestamp: string;
}

export class TxQueryAdapter implements QueryAdapter {
  readonly domain = "tx" as const;
  private readonly rootDir: string;
  private readonly backend: QueryBackend;

  constructor(rootDir: string, backend: QueryBackend) {
    this.rootDir = rootDir;
    this.backend = backend;
  }

  supportedOps() {
    return ["aggregate"] as const;
  }

  supportedFilters() {
    return ["txId"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    switch (request.op) {
      case "aggregate":
        return this.executeAggregate(request);
      default:
        throw new Error(`Unknown tx op: ${request.op}`);
    }
  }

  private async executeAggregate(
    request: QueryRequest
  ): Promise<QueryResult<TxAggregation>> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("tx aggregate requires params.txId");

    const warnings: string[] = [];
    const artifacts = await this.findArtifactsByTxId(txId, warnings);
    const events = await this.findEventsByTxId(txId);

    if (artifacts.length === 0) warnings.push("No artifacts found for this txId");
    if (events.length === 0) warnings.push("No events found for this txId");

    // Check completeness: do we have plan -> signed -> receipt (or a submission)?
    const roles = new Set(artifacts.map((a) => a.role));
    if (!roles.has("plan")) warnings.push("Missing tx plan artifact");
    if (!roles.has("signed")) warnings.push("Missing signed tx artifact");
    if (!roles.has("receipt") && !roles.has("submission"))
      warnings.push("Missing tx receipt artifact (may not exist yet)");

    const complete = roles.has("plan") && roles.has("signed");

    const result: TxAggregation = {
      txId,
      artifacts,
      events: events.sort(
        (a, b) =>
          deterministicCompare(a.timestamp, b.timestamp) ||
          deterministicCompare(a.eventId, b.eventId)
      ),
      warnings,
      complete
    };

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = [
        {
          question: `Causal aggregation for transaction ${txId}?`,
          answer: complete
            ? `Found ${artifacts.length} artifact(s) and ${events.length} event(s). Workflow is consistent.`
            : `Aggregation incomplete: ${warnings.join(". ")}.`,
          evidence: [{ type: "txId", value: txId }],
          causalChain: [
            {
              order: 1,
              assertion: `Artifacts linked: ${artifacts.length}`,
              evidence: artifacts.map((a) => a.role).join(", ")
            },
            {
              order: 2,
              assertion: `Events linked: ${events.length}`,
              evidence: "Events found in stream"
            },
            {
              order: 3,
              assertion: `Completeness check: ${complete}`,
              evidence: warnings.join("; ") || "all required roles found"
            }
          ],
          model: "tx-causality",
          confidence: "definitive"
        }
      ];
    }

    return paginateAndFormatResult({
      request,
      items: [result],
      domain: "tx",
      op: "aggregate",
      deterministic: true,
      why,
      annotations: {
        executionMs: Date.now() - start
      }
    });
  }

  /**
   * WORKSPACE-AUTHORITY-1 (D) · a transaction's evidence is what the product's own authority says it is, never an equality
   * on txId-like fields: the tx namespace (its receipts and submissions, TX_NAMESPACE_SCHEMAS, as the resolver answers
   * `{ tx }`), the authenticated lineage of those anchors — their ancestors (the signed artifact and its plan) and their
   * descendants (a trace, a replay report) — and the observations whose subject is the txId. Every artifact counts only
   * when it verifies as the identity it claims, nothing crosses a namespace (an artifactId is never compared with a txId),
   * and each one is listed once, by identity, with a role from its exact schema.
   */
  private async findArtifactsByTxId(txId: string, warnings: string[]): Promise<TxArtifactRef[]> {
    const docs = await this.backend.findArtifacts();
    type Verified = { doc: (typeof docs)[number]; artifactId: string; schema: string };
    const byIdentity = new Map<string, Verified[]>();
    const verified: Verified[] = [];
    const schemaOf = (payload: any): string =>
      typeof payload?.schema === "string" && payload.schema !== ""
        ? payload.schema
        : typeof payload?.schemaVersion === "string"
          ? payload.schemaVersion
          : "";
    let unverifiedCandidates = 0;
    for (const doc of docs) {
      const payload = doc.payload;
      const schema = schemaOf(payload);
      const check = checkArtifactIdentity(payload);
      if (!check.ok) {
        const candidate =
          (TX_NAMESPACE_SCHEMAS.has(schema) && payload?.txId === txId) ||
          (schema === HardkasSchemas.TxObservationV1 && payload?.subject?.txId === txId);
        if (candidate) unverifiedCandidates++;
        continue;
      }
      const v = { doc, artifactId: check.artifactId, schema };
      verified.push(v);
      const copies = byIdentity.get(check.artifactId);
      if (copies) copies.push(v);
      else byIdentity.set(check.artifactId, [v]);
    }
    if (unverifiedCandidates > 0) {
      warnings.push(`${unverifiedCandidates} artifact(s) claiming this txId do not verify as the identity they claim and were not used`);
    }

    const included = new Map<string, Verified>();
    const take = (v: Verified) => {
      if (!included.has(v.artifactId)) included.set(v.artifactId, preferredCopy(byIdentity.get(v.artifactId)!));
    };
    // 1. the tx namespace: receipts and submissions of this txId
    const anchors = verified.filter((v) => TX_NAMESPACE_SCHEMAS.has(v.schema) && v.doc.payload?.txId === txId);
    anchors.forEach(take);
    // 2. their ancestors, through each artifact's authenticated parent reference
    for (const anchor of anchors) {
      let current: Verified | undefined = anchor;
      for (let hop = 0; current && hop < 64; hop++) {
        const parentId = parentReferenceOf(current.doc.payload);
        if (!parentId) break;
        const parent: Verified | undefined = byIdentity.get(parentId)?.[0];
        if (!parent) {
          warnings.push(`The lineage of ${current.schema} ${current.artifactId} names a parent (${parentId}) that is not in the artifact store`);
          break;
        }
        take(parent);
        current = parent;
      }
    }
    // 3. the descendants of the anchors (whatever names one of them, or one of those, as its parent)
    const reached = new Set(anchors.map((a) => a.artifactId));
    for (let grew = true; grew; ) {
      grew = false;
      for (const v of verified) {
        if (reached.has(v.artifactId)) continue;
        const parentId = parentReferenceOf(v.doc.payload);
        if (parentId && reached.has(parentId)) {
          reached.add(v.artifactId);
          take(v);
          grew = true;
        }
      }
    }
    // 4. the observations whose subject is this txId
    verified
      .filter((v) => v.schema === HardkasSchemas.TxObservationV1 && v.doc.payload?.subject?.txId === txId)
      .forEach(take);

    return [...included.values()]
      .map((v) => ({
        filePath: v.doc.path,
        schema: v.schema,
        contentHash: v.artifactId,
        role: roleOf(v.schema)
      }))
      .sort((a, b) => deterministicCompare(a.filePath, b.filePath));
  }

  private async findEventsByTxId(txId: string): Promise<TxEventRef[]> {
    const docs = await this.backend.getEvents({ txId });
    const results: TxEventRef[] = [];

    for (const doc of docs) {
      results.push({
        eventId: doc.eventId,
        kind: doc.kind,
        timestamp: doc.timestamp || ""
      });
    }

    return results;
  }
}
