import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export interface KaspaSigningBackendStatus {
  available: boolean;
  name: string;
  version?: string;
  error?: string;
  capabilities: {
    transactionV1Signing: boolean;
  };
}

export interface WasmProviderConfig {
  provider: "npm" | "local" | "release-asset";
  path?: string;
}

/**
 * Loads the official Kaspa WASM SDK dynamically.
 * This ensures the toolkit remains usable even if the SDK is not installed.
 */
export async function loadKaspaWasm(config?: WasmProviderConfig): Promise<any> {
  const provider = config?.provider || "npm";
  
  if (provider === "npm") {
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

  if (provider === "local" || provider === "release-asset") {
    if (!config?.path) {
      throw new Error(`WASM_PROVIDER_ERROR: 'path' must be provided when using provider '${provider}'`);
    }
    
    const absolutePath = path.isAbsolute(config.path) ? config.path : path.resolve(process.cwd(), config.path);
    if (!fs.existsSync(absolutePath)) {
      if (provider === "release-asset") {
        const err = new Error(`WASM_RELEASE_ASSET_NOT_FOUND: Could not find WASM release asset at ${absolutePath}`);
        (err as any).code = "WASM_RELEASE_ASSET_NOT_FOUND";
        throw err;
      }
      throw new Error(`WASM_PROVIDER_ERROR: Local WASM path does not exist at ${absolutePath}`);
    }

    try {
      let entryPath = absolutePath;
      if (fs.statSync(absolutePath).isDirectory()) {
        const pkgPath = path.join(absolutePath, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.main) {
            entryPath = path.join(absolutePath, pkg.main);
          } else {
            entryPath = path.join(absolutePath, "index.js");
          }
        } else {
          entryPath = path.join(absolutePath, "index.js");
        }
      }
      return await import(pathToFileURL(entryPath).href);
    } catch (error: any) {
      const err = new Error(`WASM_LOAD_FAILED: Failed to load local WASM backend from ${absolutePath}. Details: ${error.message}`);
      (err as any).code = "WASM_LOAD_FAILED";
      throw err;
    }
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
  if (sdk.createV1Transaction || (sdk.Transaction && sdk.Transaction.prototype && !!Object.getOwnPropertyDescriptor(sdk.Transaction.prototype, 'storageMass'))) {
     v1 = true;
  }
  return { transactionV1Signing: v1 };
}

/**
 * Checks if the Kaspa WASM SDK is available without throwing.
 */
export async function getKaspaSigningBackendStatus(config?: WasmProviderConfig): Promise<KaspaSigningBackendStatus> {
  try {
    const sdk = await loadKaspaWasm(config);
    return {
      available: true,
      name: "Kaspa WASM SDK",
      version: sdk.version || "unknown",
      capabilities: detectCapabilities(sdk)
    };
  } catch (error: any) {
    if (error.code === "WASM_RELEASE_ASSET_NOT_FOUND") {
      throw error; // Bubble this up
    }
    return {
      available: false,
      name: "None",
      error: error instanceof Error ? error.message : String(error),
      capabilities: { transactionV1Signing: false }
    };
  }
}
