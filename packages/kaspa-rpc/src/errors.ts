export class RpcError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string,
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
  constructor(message: string = "RPC service unavailable", code?: number | string) {
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
  constructor(message: string, code?: number | string, data?: unknown) {
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
  constructor(message: string = "RPC connection failed", code?: number | string) {
    super(message, code, undefined, true);
    this.name = "RpcConnectionError";
  }
}

/**
 * NODE-NETWORK-IDENTITY-1: the node behind an endpoint is not the network the caller expects (MISMATCH), or did not
 * say which network it serves (UNKNOWN). Raised before any of the caller's requests reach that node; never retried
 * (another attempt asks the same node). `endpoint` carries no URL credentials.
 * MAINNET-PERIMETER-1: MAINNET_BROADCAST_DISABLED is the same kind of refusal, raised right before a broadcast when the
 * node (or the network it is used as) is of the mainnet type — the product policy (@hardkas/core mainnet-policy).
 */
export type NodeNetworkIdentityCode = "NODE_NETWORK_MISMATCH" | "NODE_NETWORK_UNKNOWN" | "MAINNET_BROADCAST_DISABLED";

export interface NodeNetworkIdentity {
  readonly expected: string;
  readonly observed?: string | undefined;
  readonly endpoint: string;
}

export class NodeNetworkIdentityError extends RpcError {
  constructor(
    code: NodeNetworkIdentityCode,
    message: string,
    public readonly identity: NodeNetworkIdentity
  ) {
    super(message, code, identity, false);
    this.name = "NodeNetworkIdentityError";
  }
}

export function isNodeNetworkIdentityError(error: unknown): error is NodeNetworkIdentityError {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    error instanceof NodeNetworkIdentityError ||
    code === "NODE_NETWORK_MISMATCH" ||
    code === "NODE_NETWORK_UNKNOWN" ||
    (error instanceof RpcError && code === "MAINNET_BROADCAST_DISABLED")
  );
}

/**
 * TX-SEND-BLOCKED-OUTCOME-1: a request that certainly never left this process — refused before it reached the
 * transport: its conversion or pre-send checks failed, no connection could be opened, the method does not exist, or an
 * interceptor in front of the transport refused it. Interceptors signal that with the code `RPC_REQUEST_NOT_SENT`.
 * Raised for submitTransaction only, where "not sent" and "sent, answer lost" mean different things. Never retried.
 */
export class RpcRequestNotSentError extends RpcError {
  constructor(message: string, cause?: unknown) {
    super(message, "RPC_REQUEST_NOT_SENT", cause === undefined ? undefined : { cause: cause instanceof Error ? cause.message : String(cause) }, false);
    this.name = "RpcRequestNotSentError";
  }
}

/**
 * Whether a submitTransaction failure certainly never left this process: an RpcRequestNotSentError, an error carrying
 * the interceptor code RPC_REQUEST_NOT_SENT, or a typed error the session MARKED as raised before the transport (it
 * keeps its own type and code — e.g. RpcValidationError RPC_STORAGE_MASS_CONFLICT, RpcConnectionError).
 */
export function isRpcRequestNotSentError(error: unknown): boolean {
  const e = error as { code?: unknown; requestNotSent?: unknown } | null;
  return error instanceof RpcRequestNotSentError || e?.code === "RPC_REQUEST_NOT_SENT" || e?.requestNotSent === true;
}

/** Marks a failure raised before the request reached the transport (see isRpcRequestNotSentError); returns it. */
export function markRequestNotSent<T>(error: T): T | RpcRequestNotSentError {
  if (error === null || typeof error !== "object") return new RpcRequestNotSentError(`submitTransaction was not sent: ${String(error)}`, error);
  Object.defineProperty(error, "requestNotSent", { value: true, enumerable: false, configurable: true });
  return error;
}

export class RpcProtocolError extends RpcError {
  constructor(message: string = "Invalid RPC protocol response", code?: number | string) {
    super(message, code, undefined, false);
    this.name = "RpcProtocolError";
  }
}

export class RpcNotFoundError extends RpcError {
  constructor(message: string = "Resource not found", code?: number | string) {
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
  if (error instanceof RpcError && error.name !== "RpcError") {
    return error;
  }
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
