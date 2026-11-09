import { loadManagedKaspaWasmSync } from "@hardkas/core";

/**
 * HK-06 / CA-EV-01 (audit 6-nov-2026): the simulator tests loaded kaspa-wasm from the owner's absolute home path
 * (`C:\Users\jrodr\.hardkas\...`), outside the gate's private HARDKAS_HOME and without checking the pin. They load the
 * managed, digest-verified toolchain instead (HARDKAS_HOME); when it is not installed the tests that need it are
 * skipped with this reason, never passed empty.
 */
export function managedKaspaWasm(): { k: any; reason: string } {
  try {
    return { k: loadManagedKaspaWasmSync(), reason: "" };
  } catch (e: any) {
    return { k: null, reason: `managed kaspa-wasm unavailable (${e?.code ?? e?.message ?? e}); install it with 'hardkas toolchain install kaspa-wasm'` };
  }
}
