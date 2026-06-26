import { listL2Profiles, getL2Profile, L2NetworkProfile } from "@hardkas/l2";

/**
 * HardKAS L2 Module
 * @alpha
 */
export class HardkasL2 {
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
   * L2 transaction surface (Experimental)
   */
  async tx(): Promise<never> {
    throw new Error("NOT_IMPLEMENTED: L2 transactions are not yet supported in the SDK facade. Use CLI for experimental features.");
  }

  /**
   * L2 contract surface (Experimental)
   */
  async contract(): Promise<never> {
    throw new Error("NOT_IMPLEMENTED: L2 contracts are not yet supported in the SDK facade. Use CLI for experimental features.");
  }

  /**
   * L2 bridge surface (Experimental)
   */
  async bridge(): Promise<never> {
    throw new Error("NOT_IMPLEMENTED: L2 bridge is not yet supported in the SDK facade. Use CLI for experimental features.");
  }
}
