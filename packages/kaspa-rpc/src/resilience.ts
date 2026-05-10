import { KaspaNodeInfo } from "./index.js";

export type RpcHealthState =
  | "healthy"
  | "degraded"
  | "stale"
  | "unreachable";

export type RpcConfidence =
  | "high"
  | "medium"
  | "low";

export interface RpcTrace {
  endpoint: string;
  method: string;
  latencyMs: number;
  retries: number;
  timedOut: boolean;
  errorClass?: string;
}

export interface ResilienceReport {
  state: RpcHealthState;
  confidence: RpcConfidence;
  score: number; // 0-100
  issues: string[];
}

/**
 * Calculates RPC confidence based on health metrics.
 */
export function calculateConfidence(metrics: {
  latencyMs: number | null;
  successRate: number;
  retries: number;
  stale: boolean;
  reachable: boolean;
  circuitOpen: boolean;
}): ResilienceReport {
  const issues: string[] = [];
  let score = 100;

  if (!metrics.reachable) {
    return { state: "unreachable", confidence: "low", score: 0, issues: ["Endpoint is unreachable"] };
  }

  if (metrics.circuitOpen) {
    score -= 50;
    issues.push("Circuit breaker is OPEN");
  }

  if (metrics.stale) {
    score -= 40;
    issues.push("Node appears to be STALE (DAA score not advancing)");
  }

  if (metrics.latencyMs !== null) {
    if (metrics.latencyMs > 1000) {
      score -= 20;
      issues.push(`High latency: ${metrics.latencyMs}ms`);
    } else if (metrics.latencyMs > 500) {
      score -= 10;
      issues.push(`Slightly high latency: ${metrics.latencyMs}ms`);
    }
  }

  if (metrics.successRate < 95) {
    score -= (100 - metrics.successRate) * 2;
    issues.push(`Low success rate: ${metrics.successRate.toFixed(1)}%`);
  }

  if (metrics.retries > 0) {
    score -= Math.min(metrics.retries * 5, 20);
    issues.push(`Request stability issues: ${metrics.retries} retries detected`);
  }

  // Final Classification
  score = Math.max(0, Math.min(100, score));
  
  let state: RpcHealthState = "healthy";
  if (metrics.stale) state = "stale";
  else if (score < 50) state = "degraded";
  else if (score < 90) state = "degraded"; 

  let confidence: RpcConfidence = "high";
  if (score < 40) confidence = "low";
  else if (score <= 80) confidence = "medium";

  return { state, confidence, score, issues };
}

/**
 * Classifies an error as transient (retriable) or permanent.
 */
export function classifyRpcError(error: any): { retriable: boolean; category: string } {
  const msg = (error.message || String(error)).toLowerCase();
  
  // Permanent / Deterministic
  const permanentMarkers = [
    "invalid address",
    "insufficient funds",
    "dust",
    "method not found",
    "already spent",
    "invalid transaction",
    "schema validation"
  ];
  
  if (permanentMarkers.some(m => msg.includes(m))) {
    return { retriable: false, category: "validation" };
  }

  // Transient / Network
  const transientMarkers = [
    "timeout",
    "timed out",
    "abort",
    "connection refused",
    "fetch failed",
    "429",
    "503",
    "too many requests",
    "circuit open"
  ];

  if (transientMarkers.some(m => msg.includes(m))) {
    return { retriable: true, category: "network" };
  }

  return { retriable: true, category: "unknown" }; // Default to retriable for safety
}
