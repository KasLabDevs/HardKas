import type { PsktOperation } from "./pskt-adapter.js";

export abstract class PsktAdapterError extends Error {
  abstract readonly code: string;

  public readonly adapterId: string;
  public readonly operation?: PsktOperation;
  public readonly sessionId?: string;
  public readonly payloadHash?: string;
  public readonly cause?: unknown;

  constructor(
    message: string,
    context: {
      adapterId: string;
      operation?: PsktOperation;
      sessionId?: string;
      payloadHash?: string;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.adapterId = context.adapterId;
    if (context.operation !== undefined) this.operation = context.operation;
    if (context.sessionId !== undefined) this.sessionId = context.sessionId;
    if (context.payloadHash !== undefined) this.payloadHash = context.payloadHash;
    if (context.cause !== undefined) this.cause = context.cause;
  }
}

export class PsktAdapterUnavailableError extends PsktAdapterError {
  readonly code = "PSKT_ADAPTER_UNAVAILABLE";
}

export class PsktOperationUnsupportedError extends PsktAdapterError {
  readonly code = "PSKT_OPERATION_UNSUPPORTED";
}

export class PsktAdapterProtocolError extends PsktAdapterError {
  readonly code = "PSKT_ADAPTER_PROTOCOL_ERROR";
}

export class PsktPayloadRejectedError extends PsktAdapterError {
  readonly code = "PSKT_PAYLOAD_REJECTED";
}

export class PsktUnsignedTransactionMismatchError extends PsktAdapterError {
  readonly code = "PSKT_UNSIGNED_TX_MISMATCH";
}

export class PsktAdapterTimeoutError extends PsktAdapterError {
  readonly code = "PSKT_ADAPTER_TIMEOUT";
}

export class PsktAdapterMismatchError extends PsktAdapterError {
  readonly code = "PSKT_ADAPTER_MISMATCH";
}

export class PsktCapabilitiesChangedError extends PsktAdapterError {
  readonly code = "PSKT_CAPABILITIES_CHANGED";
}

export class PsktRuntimeBindingNotFoundError extends PsktAdapterError {
  readonly code = "PSKT_RUNTIME_BINDING_NOT_FOUND";
}

export class PsktAdapterAlreadyRegisteredError extends PsktAdapterError {
  readonly code = "PSKT_ADAPTER_ALREADY_REGISTERED";
}
