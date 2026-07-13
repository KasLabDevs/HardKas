import type { HardkasConfig } from "./types.js";

/**
 * Enforces strict configuration schema for 0.11.3+
 */
export function validateHardkasConfig(config: HardkasConfig): void {
  // allowPublic defaults to false. If explicitly true, it must be allowed or experimental enabled if we want to restrict it.
  // Actually, the user prompt said "network.allowPublic default false, experimental disabled by default, artifacts deterministic true".
  
  if (config.network?.allowPublic) {
    if (config.experimental !== true) {
      throw new Error("HARDKAS_CONFIG_ERROR: network.allowPublic=true requires experimental=true in hardkas.config.ts");
    }
  }

  // Ensure deterministic artifacts are enforced implicitly or explicitly
  if (config.artifacts && config.artifacts.deterministic === false) {
    if (config.experimental !== true) {
      throw new Error("HARDKAS_CONFIG_ERROR: artifacts.deterministic=false requires experimental=true in hardkas.config.ts");
    }
  }
}
