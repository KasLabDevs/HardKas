import { HardkasError } from "../errors.js";

export class AccountExecutionModeMismatchError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ACCOUNT_EXECUTION_MODE_MISMATCH", message, options);
    this.name = "AccountExecutionModeMismatchError";
  }
}

export class AccountNetworkMismatchError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ACCOUNT_NETWORK_MISMATCH", message, options);
    this.name = "AccountNetworkMismatchError";
  }
}

export class CrossWorldAccountCollisionError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("CROSS_WORLD_ACCOUNT_COLLISION", message, options);
    this.name = "CrossWorldAccountCollisionError";
  }
}

export class ExecutionModeMismatchError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("EXECUTION_MODE_MISMATCH", message, options);
    this.name = "ExecutionModeMismatchError";
  }
}

export class ExecutionDomainMismatchError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("EXECUTION_DOMAIN_MISMATCH", message, options);
    this.name = "ExecutionDomainMismatchError";
  }
}

export class ExecutionNetworkMismatchError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("EXECUTION_NETWORK_MISMATCH", message, options);
    this.name = "ExecutionNetworkMismatchError";
  }
}

export class CrossWorldCompatibilityError extends HardkasError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("CROSS_WORLD_COMPATIBILITY", message, options);
    this.name = "CrossWorldCompatibilityError";
  }
}
