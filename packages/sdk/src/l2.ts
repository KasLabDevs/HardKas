import { listL2Profiles, getL2Profile, L2NetworkProfile } from "@hardkas/l2";
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
   * Lists all available L2 network profiles.
   */
  listProfiles(): readonly L2NetworkProfile[] {
    return listL2Profiles();
  }

  /**
   * Gets a specific L2 network profile by name.
   */
  getProfile(name: string): L2NetworkProfile | null {
    return getL2Profile(name) || null;
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

// SURFACE-TRUTH-1B (ST-D): a typed refusal that sends nobody anywhere. The former messages said "Use CLI for experimental
// features", but the L1 CLI registers no L2 command group.
function notInCore(what: string): HardkasError {
  return new HardkasError(
    "L2_NOT_IN_CORE",
    `${what} is not part of the HardKAS L1 core: Igra is a separate Lab, and neither this SDK nor the L1 CLI operates L2.`
  );
}
