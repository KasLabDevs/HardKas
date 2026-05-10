import path from "node:path";
import fs from "node:fs";
import { createJiti } from "jiti";
import { DEFAULT_HARDKAS_CONFIG } from "./defaults";
import type { LoadedHardkasConfig } from "./types";

export interface LoadHardkasConfigOptions {
  cwd?: string;
  configPath?: string;
}

export async function loadHardkasConfig(
  options: LoadHardkasConfigOptions = {}
): Promise<LoadedHardkasConfig> {
  const cwd = options.cwd ?? process.cwd();
  
  if (options.configPath) {
    const absolutePath = path.resolve(cwd, options.configPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`HardKAS config file not found at ${absolutePath}`);
    }
    return loadConfigFile(absolutePath, cwd);
  }

  const indicators = [
    "hardkas.config.ts",
    "hardkas.config.mts",
    "hardkas.config.js",
    "hardkas.config.mjs"
  ];

  let current = cwd;
  const root = path.parse(current).root;

  while (current !== root) {
    for (const indicator of indicators) {
      const p = path.join(current, indicator);
      if (fs.existsSync(p)) {
        return loadConfigFile(p, current);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return { 
    cwd,
    config: DEFAULT_HARDKAS_CONFIG 
  };
}

async function loadConfigFile(filePath: string, cwd: string): Promise<LoadedHardkasConfig> {
  try {
    const jiti = createJiti(import.meta.url);
    const module = await jiti.import(filePath) as any;
    const config = module.default || module.config || module;

    return {
      path: filePath,
      cwd: cwd,
      config: config
    };
  } catch (error) {
    throw new Error(`Failed to load HardKAS config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
