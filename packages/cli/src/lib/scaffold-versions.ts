/**
 * Scaffold dependency version coherence.
 *
 * Invariant:
 *   A published HardKAS CLI must generate a default project whose HardKAS
 *   dependency set is COMPATIBLE and DETERMINISTIC for that CLI
 *   distribution.
 *
 * Rules enforced here:
 *
 * - Never use a floating npm dist-tag as the version specifier for a
 *   `@hardkas/*` dependency in a scaffolded project. `latest`, `rc`,
 *   `alpha`, `beta`, `next`, `canary`, `dev` and any other mutable tag
 *   would make an already-published CLI silently generate a different
 *   dependency graph as the registry evolves. That is not release
 *   coherence.
 *
 * - The scaffolded `@hardkas/*` version equals the EXACT version of the
 *   CLI producing the scaffold. All packages in the coordinated HardKAS
 *   release publish together at the same version, so the CLI's own
 *   version is a deterministic identity for the whole set.
 *
 * - The version is read from the CLI package's own `package.json` at
 *   runtime. That file always ships in the published tarball, so the
 *   answer is stable across installation paths (`npm i`, `pnpm add`,
 *   `npx`, tarball, symlinked workspace) and is not baked in at build
 *   time.
 *
 * If a future release wants a different pinning policy (`^X.Y.Z`, a
 * curated compatibility matrix, etc.), replace `hardkasScaffoldDependencySpec`
 * with the new policy — but the ban on mutable tags must not weaken.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const FLOATING_TAGS: ReadonlySet<string> = new Set([
  "latest",
  "next",
  "rc",
  "alpha",
  "beta",
  "canary",
  "dev",
  "stable",
  "current"
]);

let cachedVersion: string | undefined;

/** Locate `@hardkas/cli`'s own `package.json` and return its `version` field. */
export function hardkasCliVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  // From tsup-built `dist/index.js`, this module lives at
  // `packages/cli/dist/lib/scaffold-versions.js` OR bundled into
  // `packages/cli/dist/index.js`. From source (`tsx`), it lives at
  // `packages/cli/src/lib/scaffold-versions.ts`. In both cases the CLI's
  // own `package.json` is up the tree by one or two dirs.
  const candidates = [
    path.resolve(__dirname, "../package.json"),      // dist/*.js -> packages/cli/package.json
    path.resolve(__dirname, "../../package.json"),   // dist/lib/*.js -> packages/cli/package.json
    path.resolve(__dirname, "../../../package.json") // src/lib/*.ts -> packages/cli/package.json (via tsx)
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = fs.readFileSync(candidate, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg && pkg.name === "@hardkas/cli" && typeof pkg.version === "string" && pkg.version.length > 0) {
        const resolved: string = pkg.version;
        cachedVersion = resolved;
        return resolved;
      }
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(
    "HARDKAS_CLI_VERSION_UNRESOLVED: cannot locate @hardkas/cli package.json to derive scaffold dependency version. " +
    "This is a packaging or install-tree defect; fail closed rather than emitting a floating dist-tag."
  );
}

/**
 * The exact dependency specifier to write for any `@hardkas/*` package in a
 * scaffolded project. Deterministic per published CLI.
 */
export function hardkasScaffoldDependencySpec(): string {
  return hardkasCliVersion();
}

export function isFloatingDistTag(spec: string): boolean {
  return FLOATING_TAGS.has(spec.trim().toLowerCase());
}

/**
 * Mutates the supplied `package.json` object so every `@hardkas/*` entry in
 * every dependency section carries the CLI's exact version. Belt-and-braces
 * defence: even if a template file on disk contains a floating tag or a
 * placeholder, the scaffolder can call this once and the emitted
 * `package.json` is coherent.
 *
 * Returns the same object mutated in place, for ergonomic chaining.
 */
export function coerceHardkasDependencyVersions<T extends Record<string, unknown>>(pkg: T): T {
  const version = hardkasScaffoldDependencySpec();
  const fields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ] as const;
  for (const field of fields) {
    const deps = (pkg as Record<string, unknown>)[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    const depsRecord = deps as Record<string, string>;
    for (const key of Object.keys(depsRecord)) {
      if (key.startsWith("@hardkas/")) {
        depsRecord[key] = version;
      }
    }
  }
  return pkg;
}

/** Sentinel value expected in static template `package.json` files. */
export const SCAFFOLD_VERSION_PLACEHOLDER = "0.0.0-scaffold-placeholder-do-not-install-directly";
