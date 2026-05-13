/**
 * Transaction Aggregation Adapter.
 *
 * Aggregates artifacts + events + lineage for a given txId.
 * Partial results are returned with explicit warnings when data is incomplete.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { validateEventEnvelope } from "@hardkas/core";
import { computeQueryHash } from "../serialize.js";
import type { QueryAdapter, QueryRequest, QueryResult, WhyBlock } from "../types.js";
import type { QueryBackend } from "../backend.js";

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

  private async executeAggregate(request: QueryRequest): Promise<QueryResult<TxAggregation>> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("tx aggregate requires params.txId");

    const warnings: string[] = [];
    const artifacts = await this.findArtifactsByTxId(txId);
    const events = await this.findEventsByTxId(txId);

    if (artifacts.length === 0) warnings.push("No artifacts found for this txId");
    if (events.length === 0) warnings.push("No events found for this txId");

    // Check completeness: do we have plan -> signed -> receipt?
    const roles = new Set(artifacts.map(a => a.role));
    if (!roles.has("plan")) warnings.push("Missing tx plan artifact");
    if (!roles.has("signed")) warnings.push("Missing signed tx artifact");
    if (!roles.has("receipt")) warnings.push("Missing tx receipt artifact (may not exist yet)");

    const complete = roles.has("plan") && roles.has("signed");

    const result: TxAggregation = {
      txId,
      artifacts,
      events: events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId)),
      warnings,
      complete
    };

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = [{
        question: `Causal aggregation for transaction ${txId}?`,
        answer: complete
          ? `Found ${artifacts.length} artifact(s) and ${events.length} event(s). Workflow is consistent.`
          : `Aggregation incomplete: ${warnings.join(". ")}.`,
        evidence: [{ type: "txId", value: txId }],
        causalChain: [
          { order: 1, assertion: `Artifacts linked: ${artifacts.length}`, evidence: artifacts.map(a => a.role).join(", ") },
          { order: 2, assertion: `Events linked: ${events.length}`, evidence: "Events found in stream" },
          { order: 3, assertion: `Completeness check: ${complete}`, evidence: warnings.join("; ") || "all required roles found" }
        ],
        model: "tx-causality",
        confidence: "definitive"
      }];
    }

    return {
      domain: "tx",
      op: "aggregate",
      items: [result],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([result]),
      why,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start
      }
    };
  }

  private async findArtifactsByTxId(txId: string): Promise<TxArtifactRef[]> {
    const docs = await this.backend.findArtifacts();
    const results: TxArtifactRef[] = [];

    for (const doc of docs) {
      const parsed = doc.payload;
      // Check if artifact references this txId
      const matchesTx = parsed.txId === txId ||
        parsed.transaction?.id === txId ||
        (parsed.lineage?.artifactId === txId);

      if (!matchesTx) continue;

      const schema = String(doc.schema);
      let role = "unknown";
      if (schema.includes("txPlan")) role = "plan";
      else if (schema.includes("signedTx")) role = "signed";
      else if (schema.includes("txReceipt")) role = "receipt";

      results.push({
        filePath: doc.path,
        schema,
        contentHash: doc.contentHash,
        role
      });
    }

    return results.sort((a, b) => a.filePath.localeCompare(b.filePath));
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
