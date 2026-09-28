import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Demo-ready · AUD-01 — a published manifest must never reference an @hardkas package
// that is not published with it. Wave 0 removed the optionalDependency on
// `@hardkas/pskt-native-win32-x64-msvc` (a platform package that has never been
// published: the npm registry answers 404), but the `prepublishOnly` hook
// (`napi prepublish -t npm --skip-optional-publish`) wrote it back into
// `packages/pskt-native/package.json` on the rc.23 publish, so the published
// rc.23 manifest declares it and `pnpm install --frozen-lockfile` fails on the
// tree the publish leaves behind. Packing does not run `prepublishOnly`; only a
// directory publish does, which is why a static check of the manifest alone is
// not enough and the hook itself is covered here.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

interface Manifest {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Workspace manifests from the `<dir>/*` globs of pnpm-workspace.yaml. */
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

const PUBLISH_LIFECYCLE = ["prepublishOnly", "prepublish", "prepack", "postpack", "publish", "postpublish"];

describe("Demo-ready · AUD-01: what gets published references only what gets published", () => {
  const all = workspaceManifests();
  const workspaceNames = new Set(all.map((w) => w.manifest.name).filter(Boolean));
  const publishable = all.filter((w) => w.manifest.name && !w.manifest.private);

  it("finds the workspace, including @hardkas/pskt-native", () => {
    expect(workspaceNames.has("@hardkas/pskt-native")).toBe(true);
    expect(workspaceNames.has("@hardkas/cli")).toBe(true);
  });

  it("no publishable manifest depends on an @hardkas package outside the workspace", () => {
    const offenders: string[] = [];
    for (const { dir, manifest } of publishable) {
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
        for (const dep of Object.keys(manifest[field] ?? {})) {
          if (dep.startsWith("@hardkas/") && !workspaceNames.has(dep)) offenders.push(`${dir} ${field} ${dep}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no publish-time lifecycle script runs napi (its pre-publish step rewrites the manifest)", () => {
    const offenders: string[] = [];
    for (const { dir, manifest } of publishable) {
      for (const hook of PUBLISH_LIFECYCLE) {
        const script = manifest.scripts?.[hook];
        if (script && /\bnapi\b/.test(script)) offenders.push(`${dir} ${hook}: ${script}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("@hardkas/pskt-native ships its own binary and loads it from its own directory", () => {
    const dir = path.join(ROOT, "packages", "pskt-native");
    const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Manifest;
    expect(manifest.files).toContain("*.node");
    const loader = readFileSync(path.join(dir, "index.js"), "utf8");
    expect(loader).toContain("./hardkas-pskt-native.");
    // The platform package is never required at runtime, so it is not a dependency either.
    expect(loader).not.toMatch(/@hardkas\/pskt-native-/);
  });
});
