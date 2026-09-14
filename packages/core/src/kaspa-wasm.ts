import { createRequire } from "node:module";
import path from "node:path";
import { KASPA_WASM_REFERENCE, getToolchainInstallDir, verifyManagedToolchainSync } from "./toolchains.js";

const localRequire = createRequire(import.meta.url);
const managedModules = new Map<string, any>();

/**
 * Loads the pinned official Kaspa WASM SDK from the managed toolchain directory.
 *
 * Fails closed: a missing install or any file that differs from the pin is an
 * error, never a fallback to another SDK. Synchronous so that synchronous
 * callers (transaction planning, address derivation) share the same authority.
 */
export function loadManagedKaspaWasmSync(): any {
  const dir = getToolchainInstallDir(KASPA_WASM_REFERENCE);

  const cached = managedModules.get(dir);
  if (cached) return cached;

  const verification = verifyManagedToolchainSync(KASPA_WASM_REFERENCE, dir);
  if (!verification.installed) {
    const err = new Error(
      `WASM_TOOLCHAIN_NOT_INSTALLED: kaspa-wasm ${KASPA_WASM_REFERENCE.version} is not installed at ${dir}.\n` +
        `Install it with: hardkas toolchain install kaspa-wasm`
    );
    (err as any).code = "WASM_TOOLCHAIN_NOT_INSTALLED";
    throw err;
  }
  if (!verification.ok) {
    const err = new Error(
      `WASM_TOOLCHAIN_INTEGRITY_FAILED: kaspa-wasm at ${dir} does not match the pinned release:\n  - ` +
        verification.problems.join("\n  - ") +
        `\nReinstall it with: hardkas toolchain install kaspa-wasm --force`
    );
    (err as any).code = "WASM_TOOLCHAIN_INTEGRITY_FAILED";
    throw err;
  }
  // The SDK is a CommonJS package that reads kaspa_bg.wasm next to itself.
  const mod = localRequire(path.join(dir, KASPA_WASM_REFERENCE.entry));
  managedModules.set(dir, mod);
  return mod;
}
