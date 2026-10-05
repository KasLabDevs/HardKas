import path from "node:path";
import fs from "node:fs";

/**
 * WORKSPACE-AUTHORITY-1 (WA-I0) · the one rule that says which directory is a HardKAS workspace's root: the directory of
 * the nearest `hardkas.config.*` at or above the start directory; with none up the tree, the start directory itself.
 * The start is the explicitly supplied directory (`--workspace`) or, without one, the current directory. A `.hardkas/`
 * directory is never a marker for this walk: a stray one (a subdirectory's) would otherwise capture the project.
 * `loadHardkasConfig` and the SDK walk with this same list, so the CLI and the SDK agree on the root.
 */
export const HARDKAS_CONFIG_FILENAMES = [
  "hardkas.config.ts",
  "hardkas.config.mts",
  "hardkas.config.js",
  "hardkas.config.mjs"
] as const;

/** The nearest `hardkas.config.*` at or above `startDir` (stopping after `stopAt` when given), or undefined. */
export function findHardkasConfigFile(startDir: string, stopAt?: string): string | undefined {
  let current = path.resolve(startDir);
  const stop = stopAt ? path.resolve(stopAt) : path.parse(current).root;
  while (true) {
    for (const name of HARDKAS_CONFIG_FILENAMES) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    if (current === stop) return undefined;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export interface WorkspaceRootResolution {
  /** The workspace root: the config's directory, or the start directory when no config is up the tree. */
  root: string;
  /** The `hardkas.config.*` that decided the root, when one did. */
  configPath?: string;
  /** Where the walk started: the explicit directory, or the current directory. */
  startDir: string;
  /** The `--workspace` value as given, when one was. */
  explicit?: string;
}

export function resolveWorkspaceRoot(options: { explicit?: string | undefined; startDir?: string | undefined } = {}): WorkspaceRootResolution {
  const startDir = path.resolve(options.explicit ?? options.startDir ?? process.cwd());
  // an explicit directory that does not exist is never walked past (a typo must not land in an enclosing project)
  const configPath =
    options.explicit !== undefined && !fs.existsSync(startDir) ? undefined : findHardkasConfigFile(startDir);
  return {
    root: configPath ? path.dirname(configPath) : startDir,
    ...(configPath ? { configPath } : {}),
    startDir,
    ...(options.explicit !== undefined ? { explicit: options.explicit } : {})
  };
}

/** Whether a workspace is there: the root has its `hardkas.config.*` or its own `.hardkas/` directory. */
export function workspaceExists(resolution: WorkspaceRootResolution): boolean {
  return resolution.configPath !== undefined || fs.existsSync(path.join(resolution.root, ".hardkas"));
}
