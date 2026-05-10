/**
 * Events Query Adapter.
 *
 * Reads events from .hardkas/events.jsonl (filesystem fallback).
 * Provides: list operations with deterministic ordering.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { validateEventEnvelope } from "@hardkas/core";
import { evaluateFilters } from "../filter.js";
import { computeQueryHash } from "../serialize.js";
import type { QueryAdapter, QueryRequest, QueryResult, QueryFilter } from "../types.js";

interface EventItem {
  readonly eventId: string;
  readonly kind: string;
  readonly domain: string;
  readonly timestamp: string;
  readonly workflowId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly txId?: string;
  readonly artifactId?: string;
  readonly networkId: string;
  readonly payload: Record<string, unknown>;
}

export class EventsQueryAdapter implements QueryAdapter {
  readonly domain = "events" as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  supportedOps() {
    return ["list", "summary"] as const;
  }

  supportedFilters() {
    return ["txId", "workflowId", "domain", "kind", "networkId", "artifactId"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    switch (request.op) {
      case "list":
        return this.executeList(request);
      default:
        throw new Error(`Unknown events op: ${request.op}`);
    }
  }

  private async executeList(request: QueryRequest): Promise<QueryResult<EventItem>> {
    const start = Date.now();
    const events = await this.loadEvents();
    const backendUsed = "filesystem";
    const eventsPath = path.join(this.rootDir, ".hardkas", "events.jsonl");

    // Apply filters
    const filtered: EventItem[] = [];
    // Check for --tx shortcut filter
    const txFilter = request.params["tx"] || request.params["txId"];
    const effectiveFilters: QueryFilter[] = [...request.filters];
    if (txFilter) {
      effectiveFilters.push({ field: "txId", op: "eq", value: txFilter });
    }

    for (const event of events) {
      if (evaluateFilters(event, effectiveFilters)) {
        filtered.push(event);
      }
    }

    // Deterministic sort: timestamp asc, then eventId lexical tiebreaker
    const sorted = [...filtered].sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp);
      if (cmp !== 0) return cmp;
      return a.eventId.localeCompare(b.eventId);
    });

    // Paginate
    const total = sorted.length;
    const paged = sorted.slice(request.offset, request.offset + request.limit);

    return {
      domain: "events",
      op: "list",
      items: paged,
      total,
      truncated: total > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: 1
      },
      ...(request.explain ? {
        explain: [{
          question: "How were events loaded?",
          conclusion: `Loaded ${events.length} events from ${backendUsed}. Applied ${effectiveFilters.length} filter(s). Returned ${paged.length}/${total} results sorted by timestamp+eventId.`,
          steps: [
            { order: 1, assertion: `Backend: ${backendUsed} (events.jsonl)`, evidence: eventsPath, rule: "Filesystem fallback" },
            { order: 2, assertion: `Filters applied: ${effectiveFilters.length}`, evidence: effectiveFilters.map(f => `${f.field} ${f.op} ${f.value}`).join(", ") || "none" },
            { order: 3, assertion: `Ordering: timestamp ASC + eventId tiebreaker`, evidence: "Deterministic" }
          ],
          model: "events-query",
          confidence: "definitive" as const,
          references: []
        }]
      } : {})
    };
  }

  private async loadEvents(): Promise<EventItem[]> {
    const eventsPath = path.join(this.rootDir, ".hardkas", "events.jsonl");
    let content: string;
    try {
      content = await fs.readFile(eventsPath, "utf-8");
    } catch {
      return [];
    }

    const lines = content.split("\n").filter(l => l.trim() !== "");
    const events: EventItem[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (!validateEventEnvelope(parsed)) continue;
        events.push({
          eventId: parsed.eventId,
          kind: parsed.kind,
          domain: parsed.domain,
          timestamp: parsed.timestamp || "",
          workflowId: parsed.workflowId,
          correlationId: parsed.correlationId,
          causationId: parsed.causationId,
          txId: parsed.txId,
          artifactId: parsed.artifactId,
          networkId: parsed.networkId,
          payload: parsed.payload
        });
      } catch {
        // Skip invalid lines
      }
    }

    return events;
  }
}
