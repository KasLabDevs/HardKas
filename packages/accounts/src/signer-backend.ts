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
export async function loadKaspaWasm(): Promise<any> {
  try {
    // @ts-ignore
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
