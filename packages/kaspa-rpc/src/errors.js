export class RpcError extends Error {
    code;
    data;
    isRetriable;
    constructor(message, code, data, isRetriable = true) {
        super(message);
        this.code = code;
        this.data = data;
        this.isRetriable = isRetriable;
        this.name = "RpcError";
    }
}
export class RpcTimeoutError extends RpcError {
    constructor(message = "RPC request timed out") {
        super(message, undefined, undefined, true);
        this.name = "RpcTimeoutError";
    }
}
export class RpcUnavailableError extends RpcError {
    constructor(message = "RPC service unavailable", code) {
        super(message, code, undefined, true);
        this.name = "RpcUnavailableError";
    }
}
export class RpcCircuitOpenError extends RpcError {
    constructor(message = "RPC circuit is open (too many failures)") {
        super(message, undefined, undefined, false);
        this.name = "RpcCircuitOpenError";
    }
}
export class RpcRateLimitError extends RpcError {
    retryAfterMs;
    constructor(message = "RPC rate limit exceeded", retryAfterMs) {
        super(message, 429, undefined, true);
        this.retryAfterMs = retryAfterMs;
        this.name = "RpcRateLimitError";
    }
}
/**
 * Errors that should NOT be retried (Deterministic/Validation)
 */
export class RpcValidationError extends RpcError {
    constructor(message, code, data) {
        super(message, code, data, false);
        this.name = "RpcValidationError";
    }
}
