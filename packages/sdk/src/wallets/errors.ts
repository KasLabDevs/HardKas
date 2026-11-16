/*
 * R3-C · the typed refusal of the browser wallet signer. A page cannot load @hardkas/core (its index imports Node
 * modules), so the browser side throws this class: the same shape as HardkasError (`name` "HardkasError", `code`,
 * `metadata`), so a caller handles both the same way. The Node side (wallet-payments.ts, covenants.ts) throws
 * HardkasError with the same codes. BROWSER-SAFE: no import.
 */
export class WalletSignerError extends Error {
  readonly code: string;
  readonly metadata?: Record<string, unknown> | undefined;

  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = "HardkasError";
    this.code = code;
    this.metadata = metadata;
  }
}

export const walletRefusal = (code: string, message: string, metadata?: Record<string, unknown>): WalletSignerError =>
  new WalletSignerError(code, message, metadata);
