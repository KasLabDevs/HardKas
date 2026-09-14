import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

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
  /**
   * - `managed` (default): the official rusty-kaspa release SDK installed by
   *   `hardkas toolchain install kaspa-wasm`, verified against the pin in
   *   @hardkas/core on every load. There is no fallback to any other SDK.
   * - `local` / `release-asset`: an explicit path chosen by the user (unverified).
   */
  provider: "managed" | "local" | "release-asset";
  path?: string;
}

/**
 * Loads the pinned official SDK (see loadManagedKaspaWasmSync in @hardkas/core).
 * Synchronous because some callers (AddressManager) expose synchronous APIs.
 */
export function loadKaspaWasmSync(): any {
  return loadManagedKaspaWasmSync();
}

/**
 * Loads the official Kaspa WASM SDK. Every HardKAS component loads the SDK
 * through here, so the pin and the integrity check apply everywhere.
 */
export async function loadKaspaWasm(config?: WasmProviderConfig): Promise<any> {
  const provider = config?.provider || "managed";

  if (provider === "managed") {
    return loadKaspaWasmSync();
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
 * Detects the specific capabilities supported by the loaded kaspa-wasm SDK.
 * Transaction v1 (Toccata) is present when `Transaction` carries `storageMass`,
 * as in the pinned 2.0.x SDK.
 */
export function detectCapabilities(sdk: any): { transactionV1Signing: boolean } {
  const v1 = !!(sdk?.Transaction?.prototype && Object.getOwnPropertyDescriptor(sdk.Transaction.prototype, "storageMass"));
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
      version: typeof sdk.version === "function" ? String(sdk.version()) : "unknown",
      capabilities: detectCapabilities(sdk)
    };
  } catch (error: any) {
    if (error.code === "WASM_RELEASE_ASSET_NOT_FOUND" || error.code === "WASM_TOOLCHAIN_INTEGRITY_FAILED") {
      throw error; // Bubble this up: a tampered or misconfigured SDK is not "unavailable"
    }
    return {
      available: false,
      name: "None",
      error: error instanceof Error ? error.message : String(error),
      capabilities: { transactionV1Signing: false }
    };
  }
}
