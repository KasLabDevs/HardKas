/**
 * Typed CLI error classes.
 *
 * Provides machine-readable error codes, actionable suggestions,
 * and structured context for programmatic error handling.
 */
export declare enum HardkasExitCode {
    SUCCESS = 0,
    RUNTIME_FAILURE = 1,
    USAGE_ERROR = 2,
    POLICY_DENIED = 3,
    CORRUPTION_DETECTED = 4
}
export declare class HardkasCliError extends Error {
    readonly code: string;
    readonly exitCode: HardkasExitCode;
    readonly suggestion?: string | undefined;
    readonly context?: Record<string, string> | undefined;
    constructor(code: string, message: string, options?: {
        exitCode?: HardkasExitCode;
        suggestion?: string;
        context?: Record<string, string>;
    });
}
export declare class WorkspaceNotFoundError extends HardkasCliError {
    constructor(path: string);
}
export declare class ReplayVerificationError extends HardkasCliError {
    readonly report: any;
    constructor(report: any);
}
export type RpcErrorCode = "CONNECTION_REFUSED" | "TIMEOUT" | "DNS_FAILURE" | "TLS_FAILURE" | "RPC_SCHEMA_ERROR" | "UNKNOWN";
export declare class RpcConnectionError extends HardkasCliError {
    constructor(options: {
        endpoint: string;
        network: string;
        protocol: string;
        errorCode: RpcErrorCode;
        rawError: string;
    });
}
export declare class RpcSchemaError extends HardkasCliError {
    constructor(options: {
        endpoint: string;
        method: string;
        suspectedCause: string;
        payloadShape?: string;
        rawError: string;
    });
}
/**
 * Classify a raw RPC error into a machine-readable {@link RpcErrorCode}.
 */
export declare function classifyRpcError(error: Error | string): RpcErrorCode;
/**
 * Return a short, human-friendly label for an {@link RpcErrorCode}.
 */
export declare function humanReadableRpcError(code: RpcErrorCode): string;
//# sourceMappingURL=cli-errors.d.ts.map