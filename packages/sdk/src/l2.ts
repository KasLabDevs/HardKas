import { HardkasError } from "@hardkas/core";
import type { Hardkas } from "./index.js";
import { HardkasIgra } from "./igra.js";

/**
 * HardKAS L2 Module
 * @alpha
 */
export class HardkasL2 {
  public readonly igra: HardkasIgra;

  constructor(sdk: Hardkas) {
    this.igra = new HardkasIgra(sdk);
  }
  /**
   * L2 profiles live in `@hardkas/l2`, outside the core SDK (L2-EXT, D2): refuses with L2_EXTENSION_REQUIRED.
   * Use `listL2Profiles()` from `@hardkas/l2` directly.
   */
  listProfiles(): never {
    throw extensionRequired("listL2Profiles()");
  }

  /**
   * L2 profiles live in `@hardkas/l2`, outside the core SDK (L2-EXT, D2): refuses with L2_EXTENSION_REQUIRED.
   * Use `getL2Profile(name)` from `@hardkas/l2` directly.
   */
  getProfile(_name: string): never {
    throw extensionRequired("getL2Profile(name)");
  }

  /**
   * L2 transaction surface: not part of the L1 core (refuses with L2_NOT_IN_CORE).
   */
  async tx(): Promise<never> {
    throw notInCore("L2 transaction support");
  }

  /**
   * L2 contract surface: not part of the L1 core (refuses with L2_NOT_IN_CORE).
   */
  async contract(): Promise<never> {
    throw notInCore("L2 contract support");
  }

  /**
   * L2 bridge surface: not part of the L1 core (refuses with L2_NOT_IN_CORE).
   */
  async bridge(): Promise<never> {
    throw notInCore("L2 bridge support");
  }
}

// L2-EXT stage 2 (D2): the core SDK no longer depends on @hardkas/l2 (nor, through it, on viem), so loading the SDK
// loads no L2 code. The profile list moved with the L2 package; the refusal names the replacement.
function extensionRequired(replacement: string): HardkasError {
  return new HardkasError(
    "L2_EXTENSION_REQUIRED",
    `L2 network profiles are not part of the HardKAS core SDK: they are in @hardkas/l2 (${replacement}), which is not ` +
      "published in this release, and neither is the CLI's l2 extension (@hardkas/ext-l2)."
  );
}

// SURFACE-TRUTH-1B (ST-D): a typed refusal that sends nobody anywhere. The former messages said "Use CLI for experimental
// features", but the L1 CLI registers no L2 command group.
function notInCore(what: string): HardkasError {
  return new HardkasError(
    "L2_NOT_IN_CORE",
    `${what} is not part of the HardKAS L1 core: Igra is a separate Lab, and neither this SDK nor the L1 CLI operates L2.`
  );
}
