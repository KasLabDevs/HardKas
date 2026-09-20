// -----------------------------------------------------------------------------
// Wave 6 · LINEAGE-1 · Typed lineage resolution errors.
//
// Two distinct conditions, two distinct codes:
//   LINEAGE_CYCLE_DETECTED  — the resolver observed a repeated artifact
//                             identity (self-cycle A→A or multi-node A→B→A).
//   LINEAGE_DEPTH_EXCEEDED  — the resolver walked more parent hops than the
//                             configured maximum without observing a cycle.
//
// Depth exhaustion is not evidence of a cycle: a long-but-honest lineage can
// exceed depth. Keep the codes separate so callers can react precisely.
// -----------------------------------------------------------------------------

export type LineageErrorCode =
  | "LINEAGE_CYCLE_DETECTED"
  | "LINEAGE_DEPTH_EXCEEDED";

export class LineageError extends Error {
  readonly code: LineageErrorCode;
  readonly context?: Record<string, string>;

  constructor(
    code: LineageErrorCode,
    message: string,
    context?: Record<string, string>
  ) {
    super(message);
    this.name = "LineageError";
    this.code = code;
    if (context !== undefined) this.context = context;
  }
}
