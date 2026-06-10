/**
 * Typed CLI error classes.
 *
 * Provides machine-readable error codes, actionable suggestions,
 * and structured context for programmatic error handling.
 */

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

export enum HardkasExitCode {
  SUCCESS = 0,
  RUNTIME_FAILURE = 1,
  USAGE_ERROR = 2,
  POLICY_DENIED = 3,
  CORRUPTION_DETECTED = 4
}

export class HardkasCliError extends Error {
  readonly code: string;
  readonly exitCode: HardkasExitCode;
  readonly suggestion?: string | undefined;
  readonly context?: Record<string, string> | undefined;

  constructor(
    code: string,
    message: string,
    options?: {
      exitCode?: HardkasExitCode;
      suggestion?: string;
      context?: Record<string, string>;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
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
  constructor(path: string) {
    super("WORKSPACE_NOT_FOUND", `Directory is not a HardKAS workspace: ${path}`, {
      suggestion:
        "Run 'hardkas new <name>' to create a workspace, or " +
        "'hardkas replay verify <path>' from a workspace directory."
    });
    this.name = "WorkspaceNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Replay errors
// ---------------------------------------------------------------------------

export class ReplayVerificationError extends HardkasCliError {
  readonly report: any;

  constructor(report: any) {
    super("REPLAY_DIVERGED", "Replay verification failed");
    this.name = "ReplayVerificationError";
    this.report = report;
  }
}

// ---------------------------------------------------------------------------
// RPC errors
// ---------------------------------------------------------------------------

export type RpcErrorCode =
  | "CONNECTION_REFUSED"
  | "TIMEOUT"
  | "DNS_FAILURE"
  | "TLS_FAILURE"
  | "RPC_SCHEMA_ERROR"
  | "UNKNOWN";

export class RpcConnectionError extends HardkasCliError {
  constructor(options: {
    endpoint: string;
    network: string;
    protocol: string;
    errorCode: RpcErrorCode;
    rawError: string;
  }) {
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
  constructor(options: {
    endpoint: string;
    method: string;
    suspectedCause: string;
    payloadShape?: string;
    rawError: string;
  }) {
    super("RPC_SCHEMA_ERROR", "The RPC node rejected the request payload schema.", {
      suggestion:
        "Check for correct address formats, valid UTXOs, and compatibility with the node version.",
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
export function classifyRpcError(error: Error | string): RpcErrorCode {
  const msg =
    typeof error === "string"
      ? error
      : `${error.message ?? ""} ${(error as any).code ?? ""}`;

  if (msg.includes("ECONNREFUSED")) return "CONNECTION_REFUSED";
  if (msg.includes("ETIMEDOUT") || msg.includes("AbortError") || msg.includes("timeout"))
    return "TIMEOUT";
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) return "DNS_FAILURE";
  if (
    msg.includes("CERT_") ||
    msg.includes("ERR_TLS") ||
    msg.includes("self signed") ||
    msg.includes("certificate")
  )
    return "TLS_FAILURE";
  if (msg.includes("request deserialization error")) return "RPC_SCHEMA_ERROR";

  return "UNKNOWN";
}

/**
 * Return a short, human-friendly label for an {@link RpcErrorCode}.
 */
export function humanReadableRpcError(code: RpcErrorCode): string {
  const labels: Record<RpcErrorCode, string> = {
    CONNECTION_REFUSED: "Connection refused",
    TIMEOUT: "Connection timed out",
    DNS_FAILURE: "DNS resolution failed",
    TLS_FAILURE: "TLS/SSL error",
    RPC_SCHEMA_ERROR: "RPC Schema Validation Error",
    UNKNOWN: "Unknown connection error"
  };
  return labels[code];
}
