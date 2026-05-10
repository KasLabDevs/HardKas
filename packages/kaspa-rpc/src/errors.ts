export class RpcError extends Error {
  constructor(
    message: string, 
    public readonly code?: number, 
    public readonly data?: unknown,
    public readonly isRetriable: boolean = true
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export class RpcTimeoutError extends RpcError {
  constructor(message: string = "RPC request timed out") {
    super(message, undefined, undefined, true);
    this.name = "RpcTimeoutError";
  }
}

export class RpcUnavailableError extends RpcError {
  constructor(message: string = "RPC service unavailable", code?: number) {
    super(message, code, undefined, true);
    this.name = "RpcUnavailableError";
  }
}

export class RpcCircuitOpenError extends RpcError {
  constructor(message: string = "RPC circuit is open (too many failures)") {
    super(message, undefined, undefined, false);
    this.name = "RpcCircuitOpenError";
  }
}

export class RpcRateLimitError extends RpcError {
  constructor(message: string = "RPC rate limit exceeded", public readonly retryAfterMs?: number) {
    super(message, 429, undefined, true);
    this.name = "RpcRateLimitError";
  }
}

/**
 * Errors that should NOT be retried (Deterministic/Validation)
 */
export class RpcValidationError extends RpcError {
  constructor(message: string, code?: number, data?: unknown) {
    super(message, code, data, false);
    this.name = "RpcValidationError";
  }
}
