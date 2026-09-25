import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves `@hardkas/<pkg>[/<subpath>]` imports to workspace *sources* for the
 * test gates, following each package's own `exports` map (falling back to
 * `main`) instead of a blanket `packages/<x>/src/index.ts` rewrite.
 *
 * Why: the previous regex alias mapped `@hardkas/testing/scenarios` to
 * `packages/testing/scenarios/src/index.ts`, so no subpath export was testable
 * in the canonical gate (AUD-04). Here a subpath resolves only when the package
 * declares it, exactly as a consumer would see it, and to the TypeScript source
 * behind the declared `dist` target.
 *
 * Undeclared subpaths return `undefined` so Vite fails loudly instead of
 * inventing a file.
 */

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.join(ROOT, "packages");
const SPECIFIER = /^@hardkas\/([^/]+)(?:\/(.+))?$/;
const CONDITIONS = ["import", "default", "require"] as const;

type ExportsField = string | Record<string, unknown> | undefined;

interface WorkspaceManifest {
  readonly exports?: ExportsField;
  readonly main?: string;
  readonly module?: string;
}

/** The subset of a Vite plugin this file provides (kept local: `vite` is only a root dependency). */
export interface WorkspaceSourcesPlugin {
  readonly name: string;
  readonly enforce: "pre";
  resolveId(source: string): string | null;
}

function pickTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const conditions = value as Record<string, unknown>;
    for (const condition of CONDITIONS) {
      const picked = pickTarget(conditions[condition]);
      if (picked) return picked;
    }
  }
  return undefined;
}

/** Returns the `dist` target the package declares for `subpath` ("." or "./x"). */
export function resolveExportTarget(exportsField: ExportsField, subpath: string): string | undefined {
  if (exportsField === undefined) return undefined;
  if (typeof exportsField === "string") return subpath === "." ? exportsField : undefined;
  const keys = Object.keys(exportsField);
  const isSubpathMap = keys.some((key) => key.startsWith("."));
  if (!isSubpathMap) return subpath === "." ? pickTarget(exportsField) : undefined;

  if (Object.prototype.hasOwnProperty.call(exportsField, subpath)) return pickTarget(exportsField[subpath]);

  // Single-`*` patterns such as "./internal/*" or "./*" (Node's subpath patterns).
  let best: { key: string; target: string } | undefined;
  for (const key of keys) {
    const star = key.indexOf("*");
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix) || subpath.length < key.length - 1) continue;
    if (best !== undefined && key.length <= best.key.length) continue;
    const captured = subpath.slice(prefix.length, subpath.length - suffix.length);
    const target = pickTarget(exportsField[key]);
    if (target) best = { key, target: target.replace("*", captured) };
  }
  return best === undefined ? undefined : best.target;
}

/** Candidate source files, most specific first, for a declared build target. */
export function sourceCandidates(target: string): string[] {
  const normalized = target.replace(/^\.\//, "");
  const candidates: string[] = [];
  const dist = /^dist\/(.+)$/.exec(normalized);
  if (dist && dist[1] !== undefined) {
    const base = dist[1].replace(/\.(c|m)?js$/, "");
    candidates.push(`src/${base}.ts`, `src/${base}/index.ts`);
  }
  candidates.push(normalized);
  return candidates;
}

/**
 * Absolute path of the workspace source for a `@hardkas/...` specifier, or
 * `undefined` when the package does not exist under `packages/` or does not
 * declare the requested subpath.
 */
export function resolveWorkspaceSource(specifier: string, packagesDir: string = PACKAGES_DIR): string | undefined {
  const match = SPECIFIER.exec(specifier);
  if (!match) return undefined;
  const pkg = match[1];
  const sub = match[2];
  if (pkg === undefined) return undefined;
  const dir = path.join(packagesDir, pkg);
  const manifestPath = path.join(dir, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as WorkspaceManifest;
  const subpath = sub === undefined ? "." : `./${sub}`;

  let target = resolveExportTarget(manifest.exports, subpath);
  if (target === undefined && subpath === "." && manifest.exports === undefined) {
    target = manifest.module ?? manifest.main ?? "./src/index.ts";
  }
  if (target === undefined) return undefined;

  for (const candidate of sourceCandidates(target)) {
    const abs = path.join(dir, candidate);
    if (existsSync(abs)) return abs;
  }
  return undefined;
}

/** Vite plugin used by every vitest config in this repository. */
export function hardkasWorkspaceSources(): WorkspaceSourcesPlugin {
  return {
    name: "hardkas:workspace-sources",
    enforce: "pre",
    resolveId(source: string): string | null {
      if (!source.startsWith("@hardkas/")) return null;
      const resolved = resolveWorkspaceSource(source);
      // Vite expects posix-style absolute ids, also on Windows.
      return resolved === undefined ? null : resolved.split(path.sep).join("/");
    }
  };
}
