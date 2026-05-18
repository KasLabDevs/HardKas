import type { HardkasConfig } from "@hardkas/config";

/**
 * Type-safe config helper for hardkas.config.ts files.
 * This is a pass-through function that provides autocompletion.
 */
export function defineConfig(config: Partial<HardkasConfig>): Partial<HardkasConfig> {
  return config;
}
