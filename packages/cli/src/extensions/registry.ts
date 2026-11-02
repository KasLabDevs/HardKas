import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LoadedHardkasConfig } from "@hardkas/config";
import {
  HARDKAS_EXTENSION_API_VERSION,
  KNOWN_EXTENSIONS,
  type HardkasExtension,
  type HardkasExtensionContext,
  type KnownExtension
} from "./api.js";

/**
 * L2-EXT stage 2 · discovery and loading of first-party extensions (design §3.3, owner correction C2).
 *
 * Nothing of an extension is imported before every check below passed:
 *   1. the project's package.json declares the catalog package (dependencies or devDependencies);
 *   2. the project config does not disable it (`extensions: { <id>: false }`);
 *   3. the package is installed in the project's own node_modules, and its real path stays inside it (no link out);
 *   4. its package.json has the expected name, the CLI's exact version, and a manifest with this id and API version;
 *   5. the manifest's entry resolves inside the package.
 * A failed check is a state (`incompatible`, `disabled`, `not_installed`), never an exception: L1 commands keep working,
 * and the extension's commands answer with a typed error that names the reason.
 */

export type ExtensionIncompatibility =
  | "outside_node_modules"
  | "name_mismatch"
  | "version_mismatch"
  | "manifest_invalid"
  | "api_version_mismatch"
  | "entry_invalid"
  | "load_failed";

export type ExtensionState =
  | { readonly status: "loaded"; readonly known: KnownExtension; readonly version: string; readonly packageDir: string; readonly extension: HardkasExtension }
  | { readonly status: "not_installed"; readonly known: KnownExtension; readonly declared: boolean }
  | { readonly status: "disabled"; readonly known: KnownExtension }
  | {
      readonly status: "incompatible";
      readonly known: KnownExtension;
      readonly reason: ExtensionIncompatibility;
      readonly detail: string;
      readonly expected?: string;
      readonly found?: string;
    };

export interface LoadedExtension {
  readonly known: KnownExtension;
  readonly version: string;
  readonly packageDir: string;
  readonly extension: HardkasExtension;
  readonly context: HardkasExtensionContext;
}

export interface ExtensionRegistry {
  readonly states: readonly ExtensionState[];
  readonly loaded: readonly LoadedExtension[];
}

export interface LoadExtensionsOptions {
  readonly workspaceRoot: string;
  readonly loadedConfig: LoadedHardkasConfig | undefined;
  readonly cliVersion: string;
  /** Test seam: how the vetted entry file is imported. */
  readonly importEntry?: (fileUrl: string) => Promise<unknown>;
}

export const EMPTY_EXTENSION_REGISTRY: ExtensionRegistry = Object.freeze({ states: [], loaded: [] });

function readJson(file: string): any | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** True when `child` is `parent` or below it (both already real paths). */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function declaredIn(projectPkg: any, packageName: string): boolean {
  if (!projectPkg || typeof projectPkg !== "object") return false;
  return [projectPkg.dependencies, projectPkg.devDependencies].some(
    (deps) => deps && typeof deps === "object" && Object.prototype.hasOwnProperty.call(deps, packageName)
  );
}

async function loadOne(known: KnownExtension, options: LoadExtensionsOptions, projectPkg: any): Promise<ExtensionState> {
  const incompatible = (reason: ExtensionIncompatibility, detail: string, extra: { expected?: string; found?: string } = {}): ExtensionState => ({
    status: "incompatible",
    known,
    reason,
    detail,
    ...extra
  });

  if (!declaredIn(projectPkg, known.packageName)) return { status: "not_installed", known, declared: false };
  const enabled = (options.loadedConfig?.config as any)?.extensions?.[known.id];
  if (enabled === false) return { status: "disabled", known };

  const nodeModules = path.join(options.workspaceRoot, "node_modules");
  const packageDir = path.join(nodeModules, ...known.packageName.split("/"));
  if (!fs.existsSync(path.join(packageDir, "package.json"))) return { status: "not_installed", known, declared: true };

  let realNodeModules: string;
  let realPackageDir: string;
  try {
    realNodeModules = fs.realpathSync(nodeModules);
    realPackageDir = fs.realpathSync(packageDir);
  } catch (e) {
    return incompatible("outside_node_modules", `cannot resolve the real path of ${packageDir}: ${(e as Error).message}`);
  }
  if (!isInside(realNodeModules, realPackageDir)) {
    return incompatible(
      "outside_node_modules",
      `${known.packageName} resolves to ${realPackageDir}, outside the project's node_modules (${realNodeModules}); a linked package is not loaded`
    );
  }

  const pkg = readJson(path.join(realPackageDir, "package.json"));
  if (!pkg || pkg.name !== known.packageName) {
    return incompatible("name_mismatch", `the package installed as ${known.packageName} is named ${JSON.stringify(pkg?.name)}`, {
      expected: known.packageName,
      found: String(pkg?.name)
    });
  }
  if (pkg.version !== options.cliVersion) {
    return incompatible("version_mismatch", `${known.packageName}@${pkg.version} does not match the CLI (${options.cliVersion}); extensions are installed at the CLI's exact version`, {
      expected: options.cliVersion,
      found: String(pkg.version)
    });
  }
  const manifest = pkg.hardkas?.extension;
  if (!manifest || typeof manifest !== "object" || manifest.id !== known.id || typeof manifest.entry !== "string") {
    return incompatible("manifest_invalid", `${known.packageName} has no valid "hardkas.extension" manifest for id '${known.id}'`);
  }
  if (manifest.apiVersion !== HARDKAS_EXTENSION_API_VERSION) {
    return incompatible("api_version_mismatch", `${known.packageName} declares extension API ${manifest.apiVersion}; this CLI implements ${HARDKAS_EXTENSION_API_VERSION}`, {
      expected: String(HARDKAS_EXTENSION_API_VERSION),
      found: String(manifest.apiVersion)
    });
  }

  let entryReal: string;
  try {
    entryReal = fs.realpathSync(path.resolve(realPackageDir, manifest.entry));
  } catch {
    return incompatible("entry_invalid", `${known.packageName}'s entry ${manifest.entry} does not exist`);
  }
  if (!isInside(realPackageDir, entryReal)) {
    return incompatible("entry_invalid", `${known.packageName}'s entry ${manifest.entry} resolves outside the package`);
  }

  let mod: any;
  try {
    const importEntry = options.importEntry ?? ((url: string) => import(url));
    mod = await importEntry(pathToFileURL(entryReal).href);
  } catch (e) {
    return incompatible("load_failed", `${known.packageName} failed to load: ${(e as Error)?.message ?? String(e)}`);
  }
  const extension: HardkasExtension | undefined = mod?.default ?? mod?.extension;
  if (!extension || typeof extension !== "object" || extension.id !== known.id || extension.apiVersion !== HARDKAS_EXTENSION_API_VERSION) {
    return incompatible("entry_invalid", `${known.packageName}'s entry does not export a HardKAS extension with id '${known.id}' and API ${HARDKAS_EXTENSION_API_VERSION}`);
  }
  return { status: "loaded", known, version: pkg.version, packageDir: realPackageDir, extension };
}

export async function loadExtensions(options: LoadExtensionsOptions): Promise<ExtensionRegistry> {
  const projectPkg = readJson(path.join(options.workspaceRoot, "package.json"));
  const states: ExtensionState[] = [];
  for (const known of KNOWN_EXTENSIONS) {
    try {
      states.push(await loadOne(known, options, projectPkg));
    } catch (e) {
      states.push({ status: "incompatible", known, reason: "load_failed", detail: (e as Error)?.message ?? String(e) });
    }
  }
  const context: HardkasExtensionContext = {
    cliVersion: options.cliVersion,
    workspaceRoot: options.workspaceRoot,
    loadedConfig: options.loadedConfig
  };
  const loaded: LoadedExtension[] = [];
  for (const s of states) {
    if (s.status === "loaded") loaded.push({ known: s.known, version: s.version, packageDir: s.packageDir, extension: s.extension, context });
  }
  return { states, loaded };
}

export function extensionStateOf(registry: ExtensionRegistry, id: string): ExtensionState | undefined {
  return registry.states.find((s) => s.known.id === id);
}
