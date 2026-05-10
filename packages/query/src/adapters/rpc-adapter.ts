/**
 * RPC Query Adapter.
 *
 * Provides: health-timeline, degradations, correlate operations
 * over the events.jsonl observability log.
 *
 * Source of truth: .hardkas/events.jsonl → rpc.* events
 */
import { readEvents } from "../events.js";
import { computeQueryHash } from "../serialize.js";
import type {
  QueryAdapter,
  QueryRequest,
  QueryResult,
  ExplainChain,
  ReasoningStep,
  RpcHealthEntry,
  RpcDegradation,
  RpcCorrelation,
  RpcNearbyError
} from "../types.js";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RpcQueryAdapter implements QueryAdapter {
  readonly domain = "rpc" as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  supportedOps() {
    return ["health-timeline", "degradations", "correlate"] as const;
  }

  supportedFilters() {
    return ["endpoint", "since", "state"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    switch (request.op) {
      case "health-timeline":
        return this.executeHealthTimeline(request);
      case "degradations":
        return this.executeDegradations(request);
      case "correlate":
        return this.executeCorrelate(request);
      default:
        throw new Error(`Unknown rpc op: ${request.op}`);
    }
  }

  // -------------------------------------------------------------------------
  // Health Timeline — confidence score over time
  // -------------------------------------------------------------------------

  private async executeHealthTimeline(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const since = request.params["since"] || undefined;

    const events = await readEvents({
      cwd: this.rootDir,
      kind: "rpc.health",
      since,
      limit: request.limit
    });

    const items: RpcHealthEntry[] = events.map(e => ({
      ts: e.ts,
      endpoint: String(e["endpoint"] || "unknown"),
      state: String(e["state"] || "unknown"),
      score: Number(e["score"] || 0),
      latencyMs: Number(e["latencyMs"] || 0),
      issues: Array.isArray(e["issues"]) ? e["issues"].map(String) : []
    }));

    return {
      domain: "rpc",
      op: "health-timeline",
      items,
      total: items.length,
      truncated: events.length >= request.limit,
      deterministic: true,
      queryHash: computeQueryHash(items),
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // Degradations — identify degradation periods
  // -------------------------------------------------------------------------

  private async executeDegradations(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const since = request.params["since"] || undefined;

    const events = await readEvents({
      cwd: this.rootDir,
      kind: "rpc.health",
      since
    });

    // Walk through events oldest-first looking for degradation windows
    const sortedEvents = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    const degradations: RpcDegradation[] = [];
    let currentDeg: {
      startTs: string;
      endpoint: string;
      events: Array<{ ts: string; score: number; state: string }>;
    } | null = null;

    for (const event of sortedEvents) {
      const state = String(event["state"] || "unknown");
      const score = Number(event["score"] || 0);
      const endpoint = String(event["endpoint"] || "unknown");

      if (state !== "healthy" && score < 90) {
        if (!currentDeg) {
          currentDeg = { startTs: event.ts, endpoint, events: [] };
        }
        currentDeg.events.push({ ts: event.ts, score, state });
      } else {
        if (currentDeg && currentDeg.events.length > 0) {
          const lastEvent = currentDeg.events[currentDeg.events.length - 1]!;
          degradations.push({
            startTs: currentDeg.startTs,
            endTs: lastEvent.ts,
            endpoint: currentDeg.endpoint,
            durationMs: new Date(lastEvent.ts).getTime() - new Date(currentDeg.startTs).getTime(),
            lowestScore: Math.min(...currentDeg.events.map(e => e.score)),
            worstState: currentDeg.events.reduce((w, e) =>
              stateRank(e.state) > stateRank(w) ? e.state : w, currentDeg.events[0]!.state),
            eventCount: currentDeg.events.length
          });
        }
        currentDeg = null;
      }
    }

    // Close open degradation
    if (currentDeg && currentDeg.events.length > 0) {
      const lastEvent = currentDeg.events[currentDeg.events.length - 1]!;
      degradations.push({
        startTs: currentDeg.startTs,
        endTs: lastEvent.ts,
        endpoint: currentDeg.endpoint,
        durationMs: new Date(lastEvent.ts).getTime() - new Date(currentDeg.startTs).getTime(),
        lowestScore: Math.min(...currentDeg.events.map(e => e.score)),
        worstState: currentDeg.events.reduce((w, e) =>
          stateRank(e.state) > stateRank(w) ? e.state : w, currentDeg.events[0]!.state),
        eventCount: currentDeg.events.length
      });
    }

    degradations.sort((a, b) => b.startTs.localeCompare(a.startTs)); // newest first
    const paged = degradations.slice(request.offset, request.offset + request.limit);

    return {
      domain: "rpc",
      op: "degradations",
      items: paged,
      total: degradations.length,
      truncated: degradations.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // Correlate — RPC state when a tx was submitted
  // -------------------------------------------------------------------------

  private async executeCorrelate(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("correlate requires params.txId");

    // Find the submission event
    const workflowEvents = await readEvents({
      cwd: this.rootDir,
      kind: "workflow.submitted"
    });

    const submission = workflowEvents.find(e => e["txId"] === txId);
    if (!submission) {
      throw new Error(`No submission event found for txId: ${txId}`);
    }

    const submittedAt = submission.ts;
    const endpoint = String(submission["endpoint"] || "unknown");

    // Find RPC health events around the submission time
    const windowMs = 30000; // ±30 seconds
    const windowStart = new Date(new Date(submittedAt).getTime() - windowMs).toISOString();
    const windowEnd = new Date(new Date(submittedAt).getTime() + windowMs).toISOString();

    const healthEvents = await readEvents({
      cwd: this.rootDir,
      kind: "rpc.health",
      since: windowStart
    });

    const nearbyHealth = healthEvents.filter(e => e.ts >= windowStart && e.ts <= windowEnd);

    // Find the closest health event before submission
    const beforeSubmission = nearbyHealth
      .filter(e => e.ts <= submittedAt)
      .sort((a, b) => b.ts.localeCompare(a.ts));

    const closestHealth = beforeSubmission[0];
    const scoreAtSubmission = closestHealth ? Number(closestHealth["score"] || 0) : -1;
    const stateAtSubmission = closestHealth ? String(closestHealth["state"] || "unknown") : "unknown";
    const latencyAtSubmission = closestHealth ? Number(closestHealth["latencyMs"] || 0) : -1;

    // Find nearby RPC errors
    const errorEvents = await readEvents({
      cwd: this.rootDir,
      kind: "rpc.error",
      since: windowStart
    });

    const nearbyErrors: RpcNearbyError[] = errorEvents
      .filter(e => e.ts >= windowStart && e.ts <= windowEnd)
      .map(e => ({
        ts: e.ts,
        error: String(e["error"] || "unknown"),
        retriable: Boolean(e["retriable"])
      }));

    // Assessment
    let assessment: "healthy" | "degraded" | "risky" = "healthy";
    if (scoreAtSubmission < 50 || nearbyErrors.length > 2) assessment = "risky";
    else if (scoreAtSubmission < 80 || nearbyErrors.length > 0) assessment = "degraded";

    const correlation: RpcCorrelation = {
      txId,
      submittedAt,
      endpoint,
      scoreAtSubmission,
      stateAtSubmission,
      latencyAtSubmission,
      nearbyErrors,
      assessment
    };

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = [explainCorrelation(correlation)];
    }

    return {
      domain: "rpc",
      op: "correlate",
      items: [correlation],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([correlation]),
      explain,
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateRank(state: string): number {
  switch (state) {
    case "unreachable": return 3;
    case "stale": return 2;
    case "degraded": return 1;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

function explainCorrelation(c: RpcCorrelation): ExplainChain {
  const steps: ReasoningStep[] = [];
  let order = 1;

  steps.push({
    order: order++,
    assertion: `Transaction ${c.txId.slice(0, 16)}... was submitted at ${c.submittedAt}`,
    evidence: `workflow.submitted event found`,
    rule: "Event correlation (events.jsonl)"
  });

  if (c.scoreAtSubmission >= 0) {
    steps.push({
      order: order++,
      assertion: `RPC confidence at submission: ${c.scoreAtSubmission}/100 (${c.stateAtSubmission})`,
      evidence: `Closest rpc.health event before submission`,
      rule: "RPC confidence scoring (resilience.ts:calculateConfidence)"
    });
  }

  if (c.nearbyErrors.length > 0) {
    steps.push({
      order: order++,
      assertion: `${c.nearbyErrors.length} RPC error(s) within ±30s of submission`,
      evidence: c.nearbyErrors.map(e => `${e.ts}: ${e.error}`).join("; "),
      rule: "RPC error correlation window (±30s)"
    });
  }

  steps.push({
    order: order++,
    assertion: `Assessment: ${c.assessment.toUpperCase()}`,
    evidence: `score=${c.scoreAtSubmission}, errors=${c.nearbyErrors.length}, latency=${c.latencyAtSubmission}ms`,
    rule: "Assessment: healthy(score≥80,0 errors), degraded(score≥50 or 1-2 errors), risky(score<50 or 3+ errors)"
  });

  return {
    question: `Was the RPC healthy when tx ${c.txId.slice(0, 16)}... was submitted?`,
    conclusion: `Assessment: ${c.assessment}. Score: ${c.scoreAtSubmission}/100. Errors nearby: ${c.nearbyErrors.length}. Endpoint: ${c.endpoint}.`,
    steps,
    model: "rpc-correlation",
    confidence: c.scoreAtSubmission >= 0 ? "definitive" : "probable",
    references: [c.txId]
  };
}
