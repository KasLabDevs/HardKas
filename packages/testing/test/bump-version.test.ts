import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// audit 2026-11-13 E-09: scripts/bump-version.mjs held both versions as constants (a no-op until both were edited; it
// rewrote itself) and replaced the old version in every .json/.ts/.mjs/.md file, release notes and evidence included.
// It now takes both versions as arguments, replaces a version only where it stands alone, and never rewrites history:
// CHANGELOG.md, docs/release/, docs/community/ and docs/internal/.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bump = await import(pathToFileURL(path.join(ROOT, "scripts", "bump-version.mjs")).href);
const OLD = "9.9.9-test.1";
const NEW = "9.9.9-test.2";

describe("audit 2026-11-13 E-09 · scripts/bump-version.mjs", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  function tree(files: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-bump-"));
    roots.push(root);
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return { root, read: (rel: string) => fs.readFileSync(path.join(root, rel), "utf8") };
  }

  it("takes the old and the new version as arguments, and refuses anything else", () => {
    expect(bump.parseBumpArgs([OLD, NEW])).toEqual({ oldVersion: OLD, newVersion: NEW, dryRun: false });
    expect(bump.parseBumpArgs([OLD, NEW, "--dry-run"])).toEqual({ oldVersion: OLD, newVersion: NEW, dryRun: true });
    expect(bump.parseBumpArgs([]).error).toBe("give the old and the new version");
    expect(bump.parseBumpArgs([OLD]).error).toBe("give the old and the new version");
    expect(bump.parseBumpArgs([OLD, OLD]).error).toBe(`the old and the new version are the same (${OLD})`);
    expect(bump.parseBumpArgs(["latest", NEW]).error).toBe('"latest" is not a version (x.y.z or x.y.z-pre)');
    expect(bump.parseBumpArgs([OLD, NEW, "--force"]).error).toBe("unknown option --force");
  });

  it("carries no version of its own", () => {
    const src = fs.readFileSync(path.join(ROOT, "scripts", "bump-version.mjs"), "utf8");
    const rootVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version as string;
    expect(src.includes(rootVersion)).toBe(false);
  });

  it("replaces the version where it stands alone and never in the history of earlier releases", () => {
    const w = tree({
      "package.json": JSON.stringify({ version: OLD }),
      "packages/a/package.json": JSON.stringify({ version: OLD, dependencies: { "@hardkas/b": OLD } }),
      "packages/a/src/version.ts": `export const V = "${OLD}"; // not "${OLD}0", not "1${OLD}"\n`,
      "packages/a/CHANGELOG.md": `## ${OLD}\n`,
      "packages/a/dist/index.js": `"${OLD}"\n`,
      "node_modules/x/package.json": JSON.stringify({ version: OLD }),
      "CHANGELOG.md": `## ${OLD}\n`,
      "docs/release/notes.md": `${OLD}\n`,
      "docs/community/kit/EVIDENCE_INDEX.md": `${OLD}\n`,
      "docs/internal/audit/evidence/a.md": `${OLD}\n`,
      "docs/start/installation.md": `npm i @hardkas/cli@${OLD}; hardkas-cli-${OLD}.tgz; tag v${OLD}.\n`,
      "notes.txt": `${OLD}\n`
    });
    const expected = ["docs/start/installation.md", "package.json", "packages/a/package.json", "packages/a/src/version.ts"];

    expect(bump.bumpVersion(w.root, OLD, NEW, { dryRun: true })).toEqual(expected);
    expect(w.read("package.json")).toContain(OLD); // a dry run writes nothing

    expect(bump.bumpVersion(w.root, OLD, NEW)).toEqual(expected);
    expect(JSON.parse(w.read("packages/a/package.json"))).toEqual({ version: NEW, dependencies: { "@hardkas/b": NEW } });
    expect(w.read("packages/a/src/version.ts")).toBe(`export const V = "${NEW}"; // not "${OLD}0", not "1${OLD}"\n`);
    expect(w.read("docs/start/installation.md")).toBe(`npm i @hardkas/cli@${NEW}; hardkas-cli-${NEW}.tgz; tag v${NEW}.\n`);
    for (const kept of [
      "CHANGELOG.md",
      "packages/a/CHANGELOG.md",
      "docs/release/notes.md",
      "docs/community/kit/EVIDENCE_INDEX.md",
      "docs/internal/audit/evidence/a.md",
      "packages/a/dist/index.js",
      "node_modules/x/package.json",
      "notes.txt"
    ]) {
      expect(w.read(kept), kept).toContain(OLD);
      expect(w.read(kept), kept).not.toContain(NEW);
    }
    expect(bump.bumpVersion(w.root, OLD, NEW)).toEqual([]); // nothing left to change
  });

  // SEO-2026-11-22: the walk entered .worktrees/ and .claude/worktrees/ (other checkouts of this repository) and
  // rewrote them too.
  it("never enters another checkout, another repository or a hidden tool folder", () => {
    const w = tree({
      ".github/README.md": `${OLD}\n`,
      ".agents/AGENTS.md": `${OLD}\n`,
      ".worktrees/feature/package.json": JSON.stringify({ version: OLD }),
      ".claude/worktrees/w/docs/a.md": `${OLD}\n`,
      ".wrangler/cache.json": `"${OLD}"\n`,
      "vendor/other-repo/.git": "gitdir: elsewhere\n",
      "vendor/other-repo/README.md": `${OLD}\n`,
      "apps/docs/build/index.md": `${OLD}\n`,
      "packages/a/target/out.json": `"${OLD}"\n`
    });
    expect(bump.bumpVersion(w.root, OLD, NEW)).toEqual([".agents/AGENTS.md", ".github/README.md"]);
    for (const kept of [".worktrees/feature/package.json", ".claude/worktrees/w/docs/a.md", ".wrangler/cache.json", "vendor/other-repo/README.md", "apps/docs/build/index.md", "packages/a/target/out.json"]) {
      expect(w.read(kept), kept).toContain(OLD);
    }
  });

  // SEO-2026-11-22: a version followed by a pre-release or build suffix is another version.
  it("leaves a version followed by a pre-release or build suffix alone", () => {
    const w = tree({
      "apps/docs/sidebars.ts": `items: ['release/${OLD}-notes'], current: "${OLD}"\n`
    });
    expect(bump.bumpVersion(w.root, OLD, NEW)).toEqual(["apps/docs/sidebars.ts"]);
    expect(w.read("apps/docs/sidebars.ts")).toBe(`items: ['release/${OLD}-notes'], current: "${NEW}"\n`);
  });

  // SEO-2026-11-22: a final version (x.y.z) is also the version of other tools and formats (silverc v1.0.0, artifact
  // and keystore formats, templates, third-party packages): only HardKAS's own references to it are rewritten.
  it("rewrites only HardKAS's own references to a final version, and lists the rest", () => {
    const F_OLD = "8.0.0";
    const F_NEW = "8.0.1";
    const w = tree({
      "pnpm-workspace.yaml": `packages:\n  - "packages/*"\n  - "examples/*"\n\nsupportedArchitectures:\n  os:\n    - current\n`,
      "package.json": `{\n  "name": "hardkas-monorepo",\n  "version": "${F_OLD}"\n}\n`,
      "packages/a/package.json": `{\n  "name": "@hardkas/a",\n  "version": "${F_OLD}",\n  "dependencies": {\n    "@hardkas/b": "${F_OLD}",\n    "left-pad": "${F_OLD}"\n  }\n}\n`,
      "examples/x/package.json": `{\n  "name": "example-x",\n  "version": "${F_OLD}"\n}\n`,
      "packages/a/templates/app/package.json": `{\n  "name": "app",\n  "version": "${F_OLD}",\n  "dependencies": {\n    "@hardkas/cli": "^${F_OLD}"\n  }\n}\n`,
      "packages/core/src/version.ts": `export const HARDKAS_RUNTIME_VERSION = "${F_OLD}";\n`,
      "packages/a/test/fixture.ts": `const a = { hardkasVersion: "${F_OLD}", version: "${F_OLD}-alpha" };\n`,
      "packages/a/src/silver.ts": `// the managed silverc v${F_OLD}\nexport const KEYSTORE_VERSION = "${F_OLD}";\n`,
      "docs/start/installation.md": `npm i @hardkas/cli@${F_OLD}; hardkas-cli-${F_OLD}.tgz; tag v${F_OLD}; HardKAS ${F_OLD}. silverc v${F_OLD} is pinned.\n`
    });
    const expected = [
      "docs/start/installation.md",
      "examples/x/package.json",
      "package.json",
      "packages/a/package.json",
      "packages/a/templates/app/package.json",
      "packages/a/test/fixture.ts",
      "packages/core/src/version.ts"
    ];

    expect(bump.bumpMode(F_OLD)).toBe("anchored");
    expect(bump.bumpMode(OLD)).toBe("distinctive");
    const report = bump.bumpVersionReport(w.root, F_OLD, F_NEW);
    expect(report.mode).toBe("anchored");
    expect(report.changed).toEqual(expected);

    expect(JSON.parse(w.read("packages/a/package.json"))).toEqual({
      name: "@hardkas/a",
      version: F_NEW,
      dependencies: { "@hardkas/b": F_NEW, "left-pad": F_OLD }
    });
    expect(JSON.parse(w.read("examples/x/package.json")).version).toBe(F_NEW); // a workspace package follows the root
    expect(JSON.parse(w.read("packages/a/templates/app/package.json"))).toEqual({
      name: "app",
      version: F_OLD, // a template's own version is not HardKAS's
      dependencies: { "@hardkas/cli": `^${F_NEW}` }
    });
    expect(w.read("packages/core/src/version.ts")).toBe(`export const HARDKAS_RUNTIME_VERSION = "${F_NEW}";\n`);
    expect(w.read("packages/a/test/fixture.ts")).toBe(`const a = { hardkasVersion: "${F_NEW}", version: "${F_OLD}-alpha" };\n`);
    expect(w.read("packages/a/src/silver.ts")).toBe(`// the managed silverc v${F_OLD}\nexport const KEYSTORE_VERSION = "${F_OLD}";\n`);
    expect(w.read("docs/start/installation.md")).toBe(
      `npm i @hardkas/cli@${F_NEW}; hardkas-cli-${F_NEW}.tgz; tag v${F_NEW}; HardKAS ${F_NEW}. silverc v${F_OLD} is pinned.\n`
    );

    // what it left is listed, so it can be checked by hand
    expect(report.leftovers.map((l: { file: string; line: number }) => `${l.file}:${l.line}`)).toEqual([
      "docs/start/installation.md:1",
      "packages/a/package.json:6",
      "packages/a/src/silver.ts:1",
      "packages/a/src/silver.ts:2",
      "packages/a/templates/app/package.json:3"
    ]);
  });
});
