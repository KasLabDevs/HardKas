import type { Hardkas } from "./index.js";
import { HardkasCovenants, CovenantArtifact, CovenantCapabilityResult } from "./covenants.js";

// Re-export types that were previously in this file
export type { CovenantArtifact };

/**
 * @deprecated The `ToccataCapabilitiesResult` type is deprecated.
 * Toccata is no longer considered an experimental module; it is Kaspa L1 core.
 * Use `CovenantCapabilityResult` from `hardkas.covenants.checkCapabilities()` instead.
 */
export interface ToccataCapabilitiesResult {
  ok: boolean;
  schema: any; // Legacy schema
  available: boolean;
  version?: string;
  covenantsSupported: boolean;
  silverScriptSupported: boolean;
  status: "AVAILABLE" | "MISSING_DEPENDENCY" | "EXPERIMENTAL_ONLY";
}

/**
 * @deprecated The `HardkasToccata` module is deprecated.
 * Toccata is no longer considered an experimental module; it is Kaspa L1 core.
 * Use `hardkas.covenants` instead.
 * 
 * This shim preserves backward compatibility for existing code during the 0.12.x alpha series.
 * It will be removed in 0.13.0.
 */
export class HardkasToccata {
  private covenants: HardkasCovenants;

  constructor(private sdk: Hardkas) {
    this.covenants = new HardkasCovenants(sdk);
  }

  /**
   * @deprecated Use `hardkas.covenants.checkCapabilities()` instead.
   */
  async capabilities(): Promise<ToccataCapabilitiesResult> {
    console.warn("[HardKAS] hardkas.experimental.toccata.capabilities() is deprecated. Use hardkas.covenants.checkCapabilities() instead.");
    const caps = await this.covenants.checkCapabilities();
    
    return {
      ok: caps.fullyOperational,
      schema: null, // Legacy, unused
      available: caps.fullyOperational,
      covenantsSupported: caps.nodeSupportsCovenants,
      silverScriptSupported: false, // Moved to silver module probe
      status: caps.fullyOperational ? "AVAILABLE" : "MISSING_DEPENDENCY"
    };
  }

  /**
   * @deprecated Use `hardkas.covenants.planDeploy()` instead.
   */
  async buildCovenant(options: {
    scriptHash: string;
    userLane?: string;
    computeBudget?: number;
    covenant?: string;
  }): Promise<CovenantArtifact> {
    console.warn("[HardKAS] hardkas.experimental.toccata.buildCovenant() is deprecated. Use hardkas.covenants.planDeploy() instead.");
    return this.covenants.buildCovenant(options);
  }
}
