/**
 * ESCALÓN 3 · P1 — the configuration that `config init`, `config repair` and `dev init` write, and how they treat the
 * one already there.
 *
 * - The generated config imports nothing. The old templates imported `@hardkas/config`, which a project does not
 *   depend on, so the file never loaded (`Cannot find module '@hardkas/config'`), and `config repair` then took its own
 *   output for a broken config. A plain default export loads before any dependency is installed; `defineHardkasConfig`
 *   is an identity function, so wrapping the object changes nothing but the editor types.
 * - A backup never replaces an existing one: `<file>.backup`, then `<file>.backup.1`, `.2`, … (copied with
 *   COPYFILE_EXCL). Running `config repair` twice used to overwrite `<file>.backup` with the template, and the user's
 *   original was gone.
 * - Every `hardkas.config.*` the loader reads counts as an existing config, not only `hardkas.config.ts`: writing a
 *   `.ts` next to a `.mjs` would silently shadow it (the loader prefers `.ts`).
 */
import fs from "node:fs";
import path from "node:path";
import { HARDKAS_CONFIG_FILENAMES, loadHardkasConfig } from "@hardkas/config";
import { backupFileNoOverwrite } from "./backup-file.js";

export interface ScaffoldConfigOptions {
  /** Short description of the simulated network. */
  description?: string;
  /** Accounts the config declares (none by default: DEF-2, the deterministic dev accounts are resolved, not declared). */
  accounts?: Record<string, { kind: "simulated"; address: string }>;
}

/** The source of a minimal config targeting the simulator. It has no imports, so it loads in any directory. */
export function scaffoldConfigSource(options: ScaffoldConfigOptions = {}): string {
  const lines = [
    "// HardKAS configuration. It imports nothing, so it loads before any dependency is installed.",
    "// For editor types, wrap the object with defineHardkasConfig from \"@hardkas/sdk\" once it is installed.",
    "export default {",
    "  execution: {",
    "    default: \"simulator\",",
    "    targets: {",
    "      simulator: { mode: \"simulator\", domain: \"kaspa-l1\", network: \"simulated\" }",
    "    }",
    "  },",
    "  networks: {",
    options.description
      ? `    simulated: { kind: "simulated", description: ${JSON.stringify(options.description)} }`
      : "    simulated: { kind: \"simulated\" }",
    options.accounts ? "  }," : "  }"
  ];
  if (options.accounts) {
    const entries = Object.entries(options.accounts);
    lines.push("  accounts: {");
    entries.forEach(([name, a], i) => {
      lines.push(
        `    ${name}: { kind: ${JSON.stringify(a.kind)}, address: ${JSON.stringify(a.address)} }${i === entries.length - 1 ? "" : ","}`
      );
    });
    lines.push("  }");
  }
  lines.push("};", "");
  return lines.join("\n");
}

/** The `hardkas.config.*` files present in `dir`, in the loader's order (the first one is the one it loads). */
export function configFilesIn(dir: string): string[] {
  return HARDKAS_CONFIG_FILENAMES.map((name) => path.join(dir, name)).filter((f) => fs.existsSync(f));
}

/** Copies a config to `<file>.backup`, or the first free `<file>.backup.N`; never overwrites a file. */
export const backupConfigFile = backupFileNoOverwrite;

/** Loads the config at `file` with the real loader. Undefined when it loads; the loader's message when it does not. */
export async function configLoadError(file: string): Promise<string | undefined> {
  try {
    await loadHardkasConfig({ configPath: file, cwd: path.dirname(file) });
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
