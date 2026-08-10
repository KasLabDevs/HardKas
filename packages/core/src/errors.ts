export class HardkasError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "HardkasError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export type InvariantDomain =
  | "semantic"
  | "replay"
  | "provenance"
  | "structural"
  | "operational";

export type InvariantSeverity = "warning" | "error" | "fatal";

export class InvariantViolationError extends HardkasError {
  readonly domain: InvariantDomain;
  readonly severity: InvariantSeverity;

  constructor(
    domain: InvariantDomain,
    message: string,
    options?: { severity?: InvariantSeverity; cause?: unknown }
  ) {
    super(`INVARIANT_VIOLATION_${domain.toUpperCase()}`, message, {
      cause: options?.cause
    });
    this.name = "InvariantViolationError";
    this.domain = domain;
    this.severity = options?.severity || "fatal";
  }
}
