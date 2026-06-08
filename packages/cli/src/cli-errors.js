/**
 * Typed CLI error classes.
 *
 * Provides machine-readable error codes, actionable suggestions,
 * and structured context for programmatic error handling.
 */
// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------
export var HardkasExitCode;
(function (HardkasExitCode) {
    HardkasExitCode[HardkasExitCode["SUCCESS"] = 0] = "SUCCESS";
    HardkasExitCode[HardkasExitCode["RUNTIME_FAILURE"] = 1] = "RUNTIME_FAILURE";
    HardkasExitCode[HardkasExitCode["USAGE_ERROR"] = 2] = "USAGE_ERROR";
    HardkasExitCode[HardkasExitCode["POLICY_DENIED"] = 3] = "POLICY_DENIED";
    HardkasExitCode[HardkasExitCode["CORRUPTION_DETECTED"] = 4] = "CORRUPTION_DETECTED";
})(HardkasExitCode || (HardkasExitCode = {}));
export class HardkasCliError extends Error {
    code;
    exitCode;
    suggestion;
    context;
    constructor(code, message, options) {
        super(message);
        this.name = "HardkasCliError";
        this.code = code;
        this.exitCode = options?.exitCode ?? HardkasExitCode.RUNTIME_FAILURE;
        this.suggestion = options?.suggestion;
        this.context = options?.context;
    }
}
// ---------------------------------------------------------------------------
// Workspace errors
// ---------------------------------------------------------------------------
export class WorkspaceNotFoundError extends HardkasCliError {
    constructor(path) {
        super("WORKSPACE_NOT_FOUND", `Directory is not a HardKAS workspace: ${path}`, {
            suggestion: "Run 'hardkas new <name>' to create a workspace, or " +
                "'hardkas replay verify <path>' from a workspace directory."
        });
        this.name = "WorkspaceNotFoundError";
    }
}
// ---------------------------------------------------------------------------
// Replay errors
// ---------------------------------------------------------------------------
export class ReplayVerificationError extends HardkasCliError {
    report;
    constructor(report) {
        super("REPLAY_DIVERGED", "Replay verification failed");
        this.name = "ReplayVerificationError";
        this.report = report;
    }
}
export class RpcConnectionError extends HardkasCliError {
    constructor(options) {
        super(options.errorCode, humanReadableRpcError(options.errorCode), {
            suggestion: "Run 'hardkas node start' or check 'hardkas rpc health'",
            context: {
                endpoint: options.endpoint,
                network: options.network,
                protocol: options.protocol
            }
        });
        this.name = "RpcConnectionError";
    }
}
export class RpcSchemaError extends HardkasCliError {
    constructor(options) {
        super("RPC_SCHEMA_ERROR", "The RPC node rejected the request payload schema.", {
            suggestion: "Check for correct address formats, valid UTXOs, and compatibility with the node version.",
            context: {
                endpoint: options.endpoint,
                method: options.method,
                suspectedCause: options.suspectedCause,
                ...(options.payloadShape ? { payloadShape: options.payloadShape } : {}),
                rawError: options.rawError
            }
        });
        this.name = "RpcSchemaError";
    }
}
// ---------------------------------------------------------------------------
// RPC error classification
// ---------------------------------------------------------------------------
/**
 * Classify a raw RPC error into a machine-readable {@link RpcErrorCode}.
 */
export function classifyRpcError(error) {
    const msg = typeof error === "string"
        ? error
        : `${error.message ?? ""} ${error.code ?? ""}`;
    if (msg.includes("ECONNREFUSED"))
        return "CONNECTION_REFUSED";
    if (msg.includes("ETIMEDOUT") || msg.includes("AbortError") || msg.includes("timeout"))
        return "TIMEOUT";
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo"))
        return "DNS_FAILURE";
    if (msg.includes("CERT_") ||
        msg.includes("ERR_TLS") ||
        msg.includes("self signed") ||
        msg.includes("certificate"))
        return "TLS_FAILURE";
    if (msg.includes("request deserialization error"))
        return "RPC_SCHEMA_ERROR";
    return "UNKNOWN";
}
/**
 * Return a short, human-friendly label for an {@link RpcErrorCode}.
 */
export function humanReadableRpcError(code) {
    const labels = {
        CONNECTION_REFUSED: "Connection refused",
        TIMEOUT: "Connection timed out",
        DNS_FAILURE: "DNS resolution failed",
        TLS_FAILURE: "TLS/SSL error",
        RPC_SCHEMA_ERROR: "RPC Schema Validation Error",
        UNKNOWN: "Unknown connection error"
    };
    return labels[code];
}
//# sourceMappingURL=cli-errors.js.map