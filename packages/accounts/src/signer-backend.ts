export interface KaspaSigningBackendStatus {
  available: boolean;
  name: string;
  version?: string;
  error?: string;
}

/**
 * Loads the official Kaspa WASM SDK dynamically.
 * This ensures the toolkit remains usable even if the SDK is not installed.
 */
export async function loadKaspaWasm() {
  try {
    // In Node.js environment, we look for the 'kaspa' package
    // @ts-ignore - 'kaspa' package is an optional dependency
    const sdk = await import("kaspa");
    return sdk;
  } catch (error) {
    // Fallback or re-throw with helpful message
    throw new Error(
      "Kaspa WASM signing backend is not available. " +
      "Please install the official 'kaspa' package: pnpm add kaspa"
    );
  }
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
      version: sdk.version || "unknown"
    };
  } catch (error) {
    return {
      available: false,
      name: "None",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
