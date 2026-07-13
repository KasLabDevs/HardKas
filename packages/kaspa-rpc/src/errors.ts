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
  constructor(
    message: string = "RPC rate limit exceeded",
    public readonly retryAfterMs?: number
  ) {
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

export class RpcIndexError extends RpcError {
  constructor(
    public readonly context: {
      method: string;
      index: string;
      cause?: unknown;
    },
    message: string = `RPC method ${context.method} requires ${context.index} which is not enabled on the node`
  ) {
    super(message, -32000, undefined, false);
    this.name = "RpcIndexError";
  }
}

export class RpcConnectionError extends RpcError {
  constructor(message: string = "RPC connection failed", code?: number) {
    super(message, code, undefined, true);
    this.name = "RpcConnectionError";
  }
}

export class RpcProtocolError extends RpcError {
  constructor(message: string = "Invalid RPC protocol response", code?: number) {
    super(message, code, undefined, false);
    this.name = "RpcProtocolError";
  }
}

export class RpcNotFoundError extends RpcError {
  constructor(message: string = "Resource not found", code?: number) {
    super(message, code, undefined, false);
    this.name = "RpcNotFoundError";
  }
}

export function normalizeRpcError(
  error: unknown,
  context: {
    method: string;
    params?: unknown;
  }
): RpcError {
  const msg = ((error instanceof Error) ? error.message : String(error)).toLowerCase();
  const code = (error as any)?.code;
  
  if (msg.includes("method not enabled") || msg.includes("must be enabled")) {
    if (msg.includes("txindex") || msg.includes("transaction index")) {
      return new RpcIndexError({ method: context.method, index: "txindex", cause: error });
    }
    if (msg.includes("utxoindex") || msg.includes("utxo index")) {
      return new RpcIndexError({ method: context.method, index: "utxoindex", cause: error });
    }
    if (msg.includes("index is not enabled")) {
       return new RpcIndexError({ method: context.method, index: "index", cause: error });
    }
  }

  if (code === -32000) {
     if (msg.includes("txindex") || msg.includes("transaction index") || msg.includes("utxoindex") || msg.includes("utxo index") || msg.includes("index is not enabled")) {
        return new RpcIndexError({ method: context.method, index: msg.includes("utxo") ? "utxoindex" : "txindex", cause: error });
     }
  }

  if (msg.includes("not found") || code === -32601 || msg.includes("no such")) {
    return new RpcNotFoundError(((error instanceof Error) ? error.message : String(error)), code);
  }

  if (msg.includes("econnrefused") || msg.includes("timeout") || msg.includes("network") || msg.includes("connection closed")) {
    return new RpcConnectionError(((error instanceof Error) ? error.message : String(error)), code);
  }

  if (msg.includes("parse error") || msg.includes("invalid request") || msg.includes("protocol")) {
    return new RpcProtocolError(((error instanceof Error) ? error.message : String(error)), code);
  }

  return new RpcError(((error instanceof Error) ? error.message : String(error)), code, undefined, true);
}
