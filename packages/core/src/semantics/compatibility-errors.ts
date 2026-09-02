import { HardkasError } from "../errors.js";

export interface MismatchMetadata {
  expected: string;
  actual: string;
  artifact?: string;
  [key: string]: any;
}

export class AccountExecutionModeMismatchError extends HardkasError {
  constructor(metadata: MismatchMetadata, options?: { cause?: unknown }) {
    super("ACCOUNT_EXECUTION_MODE_MISMATCH", `Account execution mode mismatch. Expected: ${metadata.expected}, Actual: ${metadata.actual}`, { ...options, metadata });
    this.name = "AccountExecutionModeMismatchError";
  }
}

export class AccountNetworkMismatchError extends HardkasError {
  constructor(metadata: MismatchMetadata, options?: { cause?: unknown }) {
    super("ACCOUNT_NETWORK_MISMATCH", `Account network mismatch. Expected: ${metadata.expected}, Actual: ${metadata.actual}`, { ...options, metadata });
    this.name = "AccountNetworkMismatchError";
  }
}

export class CrossWorldAccountCollisionError extends HardkasError {
  constructor(metadata: { accountId: string, worlds: string[] }, options?: { cause?: unknown }) {
    super("CROSS_WORLD_ACCOUNT_COLLISION", `Account collision across execution worlds for ${metadata.accountId}. Found in: ${metadata.worlds.join(', ')}`, { ...options, metadata });
    this.name = "CrossWorldAccountCollisionError";
  }
}

export class ExecutionModeMismatchError extends HardkasError {
  constructor(metadata: MismatchMetadata, options?: { cause?: unknown }) {
    super("EXECUTION_MODE_MISMATCH", `Execution mode mismatch. Expected: ${metadata.expected}, Actual: ${metadata.actual}${metadata.artifact ? ` for artifact ${metadata.artifact}` : ''}`, { ...options, metadata });
    this.name = "ExecutionModeMismatchError";
  }
}

export class ExecutionDomainMismatchError extends HardkasError {
  constructor(metadata: MismatchMetadata, options?: { cause?: unknown }) {
    super("EXECUTION_DOMAIN_MISMATCH", `Execution domain mismatch. Expected: ${metadata.expected}, Actual: ${metadata.actual}${metadata.artifact ? ` for artifact ${metadata.artifact}` : ''}`, { ...options, metadata });
    this.name = "ExecutionDomainMismatchError";
  }
}

export class ExecutionNetworkMismatchError extends HardkasError {
  constructor(metadata: MismatchMetadata, options?: { cause?: unknown }) {
    super("EXECUTION_NETWORK_MISMATCH", `Execution network mismatch. Expected: ${metadata.expected}, Actual: ${metadata.actual}${metadata.artifact ? ` for artifact ${metadata.artifact}` : ''}`, { ...options, metadata });
    this.name = "ExecutionNetworkMismatchError";
  }
}

export class CrossWorldCompatibilityError extends HardkasError {
  constructor(message: string, metadata?: Record<string, any>, options?: { cause?: unknown }) {
    super("CROSS_WORLD_COMPATIBILITY", message, { ...options, metadata });
    this.name = "CrossWorldCompatibilityError";
  }
}

export class LegacyExecutionContextRequiredError extends HardkasError {
  constructor(metadata?: Record<string, any>, options?: { cause?: unknown }) {
    super("LEGACY_EXECUTION_CONTEXT_REQUIRED", "Legacy artifact does not specify an execution context. Replay requires explicit context.", { ...options, metadata });
    this.name = "LegacyExecutionContextRequiredError";
  }
}

export class ExecutionCompatibilityUndefinedError extends HardkasError {
  constructor(metadata?: Record<string, any>, options?: { cause?: unknown }) {
    super("EXECUTION_COMPATIBILITY_UNDEFINED", "Execution compatibility is undefined for the given target and runtime combination. A specific capability rule is required.", { ...options, metadata });
    this.name = "ExecutionCompatibilityUndefinedError";
  }
}

export class ExecutionTargetConflictError extends HardkasError {
  constructor(metadata?: Record<string, any>, options?: { cause?: unknown }) {
    super("EXECUTION_TARGET_CONFLICT", "Execution targets conflict and cannot be resolved safely.", { ...options, metadata });
    this.name = "ExecutionTargetConflictError";
  }
}

export class LegacyArtifactRequiresExplicitResolutionError extends HardkasError {
  constructor(metadata?: Record<string, any>, options?: { cause?: unknown }) {
    super("LEGACY_ARTIFACT_REQUIRES_EXPLICIT_RESOLUTION", "Modern execution resolution was requested, but the artifact lacks execution identity. Legacy resolution must be used explicitly.", { ...options, metadata });
    this.name = "LegacyArtifactRequiresExplicitResolutionError";
  }
}

export class ExecutionTargetUnresolvedError extends HardkasError {
  constructor(metadata?: Record<string, any>, options?: { cause?: unknown }) {
    super("EXECUTION_TARGET_UNRESOLVED", "Execution target could not be resolved from CLI arguments, config default, or legacy default.", { ...options, metadata });
    this.name = "ExecutionTargetUnresolvedError";
  }
}
