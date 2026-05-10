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
import type { QueryAdapter, QueryRequest, QueryResult, ExplainChain } from "../types.js";

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

  constructor(rootDir: string) {
    this.rootDir = rootDir;
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

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = [{
        question: `What data exists for transaction ${txId}?`,
        conclusion: complete
          ? `Found ${artifacts.length} artifact(s) and ${events.length} event(s). Workflow appears complete.`
          : `Found ${artifacts.length} artifact(s) and ${events.length} event(s). ${warnings.join(". ")}.`,
        steps: [
          { order: 1, assertion: `Backend: filesystem`, evidence: path.join(this.rootDir, ".hardkas"), rule: "Filesystem scan" },
          { order: 2, assertion: `Artifacts found: ${artifacts.length}`, evidence: artifacts.map(a => `${a.schema} (${a.role})`).join(", ") || "none" },
          { order: 3, assertion: `Events found: ${events.length}`, evidence: events.map(e => e.kind).join(", ") || "none" },
          { order: 4, assertion: `Completeness: ${complete ? "yes" : "no"}`, evidence: warnings.join("; ") || "all artifacts present" }
        ],
        model: "tx-aggregation",
        confidence: "definitive" as const,
        references: [txId]
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
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start
      }
    };
  }

  private async findArtifactsByTxId(txId: string): Promise<TxArtifactRef[]> {
    const results: TxArtifactRef[] = [];
    const files = await this.scanJsonFiles();

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (!parsed.schema) continue;

        // Check if artifact references this txId
        const matchesTx = parsed.txId === txId ||
          parsed.transaction?.id === txId ||
          (parsed.lineage?.artifactId && parsed.txId === txId);

        if (!matchesTx) continue;

        const schema = String(parsed.schema);
        let role = "unknown";
        if (schema.includes("txPlan")) role = "plan";
        else if (schema.includes("signedTx")) role = "signed";
        else if (schema.includes("txReceipt")) role = "receipt";

        results.push({
          filePath,
          schema,
          contentHash: parsed.contentHash,
          role
        });
      } catch {
        // Skip invalid files
      }
    }

    return results.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  private async findEventsByTxId(txId: string): Promise<TxEventRef[]> {
    const eventsPath = path.join(this.rootDir, ".hardkas", "events.jsonl");
    let content: string;
    try {
      content = await fs.readFile(eventsPath, "utf-8");
    } catch {
      return [];
    }

    const lines = content.split("\n").filter(l => l.trim() !== "");
    const results: TxEventRef[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (!validateEventEnvelope(parsed)) continue;
        if (parsed.txId !== txId) continue;

        results.push({
          eventId: parsed.eventId,
          kind: parsed.kind,
          timestamp: parsed.timestamp || ""
        });
      } catch {
        // Skip
      }
    }

    return results;
  }

  private async scanJsonFiles(): Promise<string[]> {
    const files: string[] = [];
    const hardkasDir = path.join(this.rootDir, ".hardkas");
    await this.walkDir(hardkasDir, files);
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
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        await this.walkDir(full, out);
      } else if (entry.name.endsWith(".json") && !entry.name.endsWith(".enc.json") && entry.name !== "events.jsonl") {
        out.push(full);
      }
    }
  }
}
