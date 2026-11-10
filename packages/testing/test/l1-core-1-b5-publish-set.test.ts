import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// L1-CORE-1 B5 · the published set. What `npm publish` would ship is every workspace manifest without `private: true`.
// That set must be exactly the list in docs/status/versioning.md ("Published packages"), and no published manifest may
// need a package that is not published with it (AUD-01 checks the workspace; this checks `private`).
// - `@hardkas/pskt-native` is on hold and its binary is win32-x64 only: private, and the SDK no longer declares it
//   (its native PSKT adapter loads it on demand and degrades to "unavailable" without it).
// - `@hardkas/ext-l2` was never published: private.
// - `@hardkas/l2` (INT9, owner policy 2026-11-09, provisional): private until its API, dependencies and promises are
//   reviewed. Its only workspace user is `@hardkas/ext-l2`, private as well.
// - The 8 packages without a consumer (surface audit 2026-11-09, inventory §1.1 and §1.4; owner order, pre-release
//   round): `@hardkas/client`, `@hardkas/react`, `@hardkas/wallet-adapter`, `@hardkas/simulator-adapters`,
//   `@hardkas/plugin-local-indexer`, `@hardkas/plugin-rpc-backend`, `@hardkas/sync-daemon` and
//   `@hardkas/storage-postgres` are private: no published package depends on them, and the monorepo's labs, reference
//   apps and showcase apps keep using them through the workspace. The published set goes from 30 to 22.
// - `snarkjs` (GPL-3.0) is an OPTIONAL peer dependency of `@hardkas/sdk`, not a dependency: installing the SDK does
//   not install it (packages/sdk/README.md §7).
// - INT9: every published package ships a README.md that its `files` names explicitly (B5 found 20 tarballs without one).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

interface Manifest {
  name?: string;
  private?: boolean;
  license?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
}

function workspaceManifests(): Array<{ dir: string; manifest: Manifest }> {
  const yaml = readFileSync(path.join(ROOT, "pnpm-workspace.yaml"), "utf8");
  const globs = [...yaml.matchAll(/^\s*-\s*"([^"]+)\/\*"\s*$/gm)].map((m) => m[1]!);
  expect(globs.length).toBeGreaterThan(0);
  const out: Array<{ dir: string; manifest: Manifest }> = [];
  for (const g of globs) {
    const base = path.join(ROOT, g);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(base, entry.name, "package.json");
      if (!existsSync(file)) continue;
      out.push({ dir: path.relative(ROOT, path.dirname(file)).split(path.sep).join("/"), manifest: JSON.parse(readFileSync(file, "utf8")) });
    }
  }
  return out;
}

/** The package names of the table rows (`| \`@hardkas/x\` | … |`) of one section of versioning.md. */
function documentedPackages(heading: string): string[] {
  const doc = readFileSync(path.join(ROOT, "docs", "status", "versioning.md"), "utf8").replace(/\r\n/g, "\n");
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, `docs/status/versioning.md has a "${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = doc.slice(start + heading.length + 2);
  const end = rest.search(/\n#{2,3} /);
  const section = end >= 0 ? rest.slice(0, end) : rest;
  return [...section.matchAll(/^\|\s*`(@hardkas\/[a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]!);
}

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe("L1-CORE-1 B5 · the published set", () => {
  const all = workspaceManifests();
  const byName = new Map(all.filter((w) => w.manifest.name).map((w) => [w.manifest.name!, w]));
  const published = all.filter((w) => w.manifest.name && w.manifest.private !== true);

  it("is exactly the list of docs/status/versioning.md, 22 packages", () => {
    const listed = documentedPackages("## Published packages");
    expect(new Set(listed).size, "no package is listed twice").toBe(listed.length);
    expect(sorted(published.map((w) => w.manifest.name!))).toEqual(sorted(listed));
    expect(listed).toHaveLength(22);
  });

  it("the 8 packages without a consumer are private, listed as not published, and still workspace packages", () => {
    const eight = [
      "@hardkas/client",
      "@hardkas/react",
      "@hardkas/wallet-adapter",
      "@hardkas/simulator-adapters",
      "@hardkas/plugin-local-indexer",
      "@hardkas/plugin-rpc-backend",
      "@hardkas/sync-daemon",
      "@hardkas/storage-postgres"
    ];
    const notPublished = documentedPackages("### Not published");
    const listed = documentedPackages("## Published packages");
    for (const name of eight) {
      expect(byName.has(name), `${name} is still a workspace package`).toBe(true);
      expect(byName.get(name)!.manifest.private, `${name} is private`).toBe(true);
      expect(notPublished, `${name} is listed under "Not published"`).toContain(name);
      expect(listed, `${name} is not listed as published`).not.toContain(name);
    }
  });

  it("the packages the document lists as not published are private", () => {
    const notPublished = documentedPackages("### Not published");
    expect(notPublished).toEqual(expect.arrayContaining(["@hardkas/ext-l2", "@hardkas/pskt-native", "@hardkas/l2"]));
    for (const name of notPublished) {
      expect(byName.get(name)?.manifest.private, `${name} is private`).toBe(true);
    }
  });

  it("INT9 · @hardkas/l2 is private and not in the published list", () => {
    expect(byName.get("@hardkas/l2")?.manifest.private).toBe(true);
    expect(documentedPackages("## Published packages")).not.toContain("@hardkas/l2");
  });

  it("INT9 · every published package has a README.md and a LICENSE, its `files` names both, and it declares MIT", () => {
    const missing: string[] = [];
    for (const { dir, manifest } of published) {
      if (!existsSync(path.join(ROOT, dir, "README.md"))) missing.push(`${dir}: no README.md`);
      if (!existsSync(path.join(ROOT, dir, "LICENSE"))) missing.push(`${dir}: no LICENSE`);
      const files = manifest.files ?? [];
      if (!files.includes("README.md")) missing.push(`${dir}: files does not list README.md`);
      if (!files.includes("LICENSE")) missing.push(`${dir}: files does not list LICENSE`);
      if (manifest.license !== "MIT") missing.push(`${dir}: license is ${JSON.stringify(manifest.license)}, not "MIT"`);
    }
    expect(missing).toEqual([]);
  });

  it("no published manifest needs a private workspace package", () => {
    const offenders: string[] = [];
    for (const { dir, manifest } of published) {
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
        for (const dep of Object.keys(manifest[field] ?? {})) {
          if (byName.get(dep)?.manifest.private === true) offenders.push(`${dir} ${field} ${dep}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("@hardkas/sdk: snarkjs is an optional peer (and a devDependency at the same version), not a dependency", () => {
    const sdk = byName.get("@hardkas/sdk")!.manifest;
    expect(sdk.dependencies?.snarkjs).toBeUndefined();
    expect(sdk.optionalDependencies?.snarkjs).toBeUndefined();
    expect(sdk.peerDependencies?.snarkjs).toMatch(/^\d+\.\d+\.\d+$/);
    expect(sdk.peerDependenciesMeta?.snarkjs?.optional).toBe(true);
    expect(sdk.devDependencies?.snarkjs).toBe(sdk.peerDependencies?.snarkjs);
  });

  it("@hardkas/sdk no longer declares @hardkas/pskt-native in any dependency field", () => {
    const sdk = byName.get("@hardkas/sdk")!.manifest;
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
      expect(Object.keys(sdk[field] ?? {}), field).not.toContain("@hardkas/pskt-native");
    }
  });
});
