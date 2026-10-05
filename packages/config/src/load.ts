import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { DEFAULT_HARDKAS_CONFIG } from "./defaults.js";
import { validateHardkasConfig } from "./schema.js";
import type { LoadedHardkasConfig, HardkasConfig } from "./types.js";
import { findHardkasConfigFile } from "./workspace-root.js";

export interface LoadHardkasConfigOptions {
  cwd?: string;
  configPath?: string;
  ambientWorkspace?: boolean;
  workspaceRoot?: string;
}

export async function loadHardkasConfig(
  options: LoadHardkasConfigOptions = {}
): Promise<LoadedHardkasConfig> {
  const cwd =
    options.cwd ??
    (options.ambientWorkspace ? process.env.INIT_CWD : undefined) ??
    process.cwd();

  if (options.configPath) {
    const absolutePath = path.resolve(cwd, options.configPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`HardKAS config file not found at ${absolutePath}`);
    }
    return loadConfigFile(absolutePath, cwd);
  }

  // WORKSPACE-AUTHORITY-1: the same walk (and file list) as `resolveWorkspaceRoot`, so a config and a root never disagree
  const start = options.workspaceRoot ?? cwd;
  const found = findHardkasConfigFile(start, options.workspaceRoot);
  if (found) {
    return loadConfigFile(found, path.dirname(found));
  }

  return {
    cwd,
    config: DEFAULT_HARDKAS_CONFIG
  };
}

async function loadConfigFile(
  filePath: string,
  cwd: string
): Promise<LoadedHardkasConfig> {
  try {
    const jitiOptions: any = {};
    try {
      const _dirname = path.dirname(fileURLToPath(import.meta.url));
      const resolvedSdk = path.resolve(_dirname, "../../sdk/src/index.ts");
      const rootPkgPath = path.resolve(_dirname, "../../../package.json");

      let isMonorepoDev = false;
      if (fs.existsSync(resolvedSdk) && fs.existsSync(rootPkgPath)) {
        const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
        if (rootPkg.name === "hardkas-monorepo") {
          isMonorepoDev = true;
        }
      }

      if (isMonorepoDev) {
        jitiOptions.alias = {
          "@hardkas/sdk": resolvedSdk
        };
      }
    } catch (e) {
      // ignore
    }
    const jiti = createJiti(filePath, jitiOptions);
    const module = (await jiti.import(filePath)) as any;
    const userConfig = module.default || module.config || module;

    // Deep merge: defaults fill missing fields, user config overrides
    const mergedConfig: HardkasConfig = {
      ...DEFAULT_HARDKAS_CONFIG,
      ...userConfig,
      // Merge networks: built-ins + user custom networks
      networks: {
        ...DEFAULT_HARDKAS_CONFIG.networks,
        ...(userConfig.networks && typeof userConfig.networks === "object"
          ? userConfig.networks
          : {})
      },
      // Merge accounts: only if user provides an object (not a number)
      accounts: {
        ...DEFAULT_HARDKAS_CONFIG.accounts,
        ...(userConfig.accounts &&
        typeof userConfig.accounts === "object" &&
        !Array.isArray(userConfig.accounts)
          ? userConfig.accounts
          : {})
      },
      // Merge tasks
      tasks: {
        ...(userConfig.tasks || {})
      },
      plugins: userConfig.plugins || []
    };

    // PAPERCUTS #37: a config that still declares the legacy `defaultNetwork` and no `execution`
    // keeps resolving through its own key (and gets the deprecation warning for it); the built-in
    // execution default must not shadow it.
    if (userConfig.execution === undefined && userConfig.defaultNetwork !== undefined) {
      delete mergedConfig.execution;
    }

    validateHardkasConfig(mergedConfig);

    return {
      path: filePath,
      cwd: cwd,
      config: mergedConfig
    };
  } catch (error) {
    throw new Error(
      `Failed to load HardKAS config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
