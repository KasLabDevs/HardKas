export interface KaspaSigningBackendStatus {
  available: boolean;
  name: string;
  version?: string;
  error?: string;
  capabilities: {
    transactionV1Signing: boolean;
  };
}

/**
 * Loads the official Kaspa WASM SDK dynamically.
 * This ensures the toolkit remains usable even if the SDK is not installed.
 */
export async function loadKaspaWasm(): Promise<any> {
  try {
    // @ts-ignore - Third party lib lacking types
    return await import("kaspa-wasm");
  } catch (error) {
    const err = new Error(
      "SIGNER_BACKEND_UNAVAILABLE: Official Kaspa WASM backend is required to sign transactions.\nInstall it via: npm install kaspa-wasm"
    );
    (err as any).code = "SIGNER_BACKEND_UNAVAILABLE";
    throw err;
  }
}

/**
 * Detects the specific capabilities supported by the installed kaspa-wasm SDK.
 */
export function detectCapabilities(sdk: any): { transactionV1Signing: boolean } {
  // Typical heuristic: if the SDK's Transaction constructor takes version as an explicit field,
  // or if there is a 'createTransactionV1' method, or if createTransaction accepts 8 args.
  // For now, if 'Transaction' has a known V1 property or 'createTransaction' length > 7 we guess V1.
  // Since kaspa-wasm@0.13.0 does not support V1, we return false unless detected.
  let v1 = false;
  if (sdk.createTransaction && sdk.createTransaction.length >= 8) {
     v1 = true;
  }
  // If the community officially adds `createV1Transaction` or something similar later:
  if (sdk.createV1Transaction || (sdk.Transaction && sdk.Transaction.prototype && sdk.Transaction.prototype.computeBudget)) {
     v1 = true;
  }
  return { transactionV1Signing: v1 };
}

/**
 * Checks if the Kaspa WASM SDK is available without throwing.
 */
export async function getKaspaSigningBackendStatus(): Promise<KaspaSigningBackendStatus> {
  try {
    const sdk = await loadKaspaWasm();
    return {
      available: true,
      name: "Kaspa WASM SDK",
      version: sdk.version || "unknown",
      capabilities: detectCapabilities(sdk)
    };
  } catch (error) {
    return {
      available: false,
      name: "None",
      error: error instanceof Error ? error.message : String(error),
      capabilities: { transactionV1Signing: false }
    };
  }
}
