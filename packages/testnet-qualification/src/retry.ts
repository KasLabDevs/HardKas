/**
 * TQ-1 retry classification.
 *
 * Rule (agreed 2026-09-15):
 * - transport / timeout / disconnect  → retry with capped exponential backoff.
 * - consensus / policy rejection      → 0 automatic retries.
 * - network mismatch                  → FAIL CLOSED immediately (do not retry).
 * - unsynced node                     → FAIL CLOSED immediately.
 * - missing required capability       → FAIL CLOSED immediately.
 * - unknown                           → treated as consensus (safer).
 *
 * `withRetryOnTransport` reties ONLY on the "transport" class. Every other
 * class throws immediately. This is deliberate: TQ receipts must not paper
 * over consensus-level rejections behind a retry loop.
 */

export type RetryErrorClass =
  | "transport"
  | "consensus"
  | "network-mismatch"
  | "unsynced"
  | "missing-capability"
  | "unknown";

const TRANSPORT_ERRNOS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN"
]);

const TRANSPORT_MESSAGE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /disconnect(ed)?/i,
  /connection (?:refused|reset|closed|lost)/i,
  /socket hang up/i,
  /network unreachable/i,
  /econn/i,
  /websocket .*(?:closed|error)/i,
  /request failed/i
];

const NETWORK_MISMATCH_PATTERNS = [/network mismatch/i, /unexpected networkid/i, /wrong network/i];
const UNSYNCED_PATTERNS = [/not synced/i, /unsynced/i, /still syncing/i];
const MISSING_CAPABILITY_PATTERNS = [
  /missing capability/i,
  /capability required/i,
  /not implemented/i,
  /unknown method/i,
  /method not supported/i
];
const CONSENSUS_PATTERNS = [
  /invalid transaction/i,
  /transaction rejected/i,
  /rejected/i,
  /policy violation/i,
  /consensus/i,
  /orphan/i,
  /already spent/i,
  /double spend/i,
  /insufficient/i,
  /mass exceeds/i,
  /fee/i
];

function messageOf(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as { message?: unknown; code?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.code === "string") return anyErr.code;
  }
  try {
    return String(err);
  } catch {
    return "";
  }
}

function codeOf(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as { code?: unknown };
  if (typeof anyErr.code === "string") return anyErr.code;
  return undefined;
}

export function classifyError(err: unknown): RetryErrorClass {
  const code = codeOf(err);
  const msg = messageOf(err);

  // Structural classifications first — precede text pattern matching.
  if (code && TRANSPORT_ERRNOS.has(code)) return "transport";
  if (err instanceof RemoteTestnetProbeFailedErrorMarker) {
    switch (err.reason) {
      case "NETWORK_MISMATCH": return "network-mismatch";
      case "UNSYNCED": return "unsynced";
      case "MISSING_CAPABILITY": return "missing-capability";
      case "RPC_ERROR": return "transport";
    }
  }

  if (NETWORK_MISMATCH_PATTERNS.some((r) => r.test(msg))) return "network-mismatch";
  if (UNSYNCED_PATTERNS.some((r) => r.test(msg))) return "unsynced";
  if (MISSING_CAPABILITY_PATTERNS.some((r) => r.test(msg))) return "missing-capability";
  if (TRANSPORT_MESSAGE_PATTERNS.some((r) => r.test(msg))) return "transport";
  if (CONSENSUS_PATTERNS.some((r) => r.test(msg))) return "consensus";
  return "unknown";
}

/**
 * Marker interface for probe errors so `classifyError` can pick them up
 * without a cyclic import against `remote-node.ts`. The concrete class in
 * remote-node.ts sets `reason` to one of the enum values below and extends
 * this marker.
 */
export abstract class RemoteTestnetProbeFailedErrorMarker extends Error {
  abstract readonly reason: "NETWORK_MISMATCH" | "UNSYNCED" | "MISSING_CAPABILITY" | "RPC_ERROR";
}

export interface WithRetryOnTransportOptions {
  /** Maximum total attempts (initial + retries). Default 3. Must be >= 1. */
  readonly maxAttempts?: number;
  /** Base backoff in ms; attempt n waits base * 2^(n-1). Default 250ms. */
  readonly backoffBaseMs?: number;
  /** Called after each transport failure, before backoff. */
  readonly onRetry?: (attempt: number, err: unknown) => void;
  /** Injectable sleeper for tests. Default: real setTimeout. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `fn`, retrying ONLY when the failure classifies as "transport".
 * Any other classification (including "unknown") throws immediately without
 * retry, per TQ policy.
 */
export async function withRetryOnTransport<T>(
  fn: () => Promise<T>,
  options: WithRetryOnTransportOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const backoffBaseMs = options.backoffBaseMs ?? 250;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const cls = classifyError(err);
      if (cls !== "transport") throw err;
      if (attempt >= maxAttempts) break;
      options.onRetry?.(attempt, err);
      await sleep(backoffBaseMs * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}
