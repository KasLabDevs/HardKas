import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// rc2 audit E-09: scripts/bump-version.mjs held both versions as constants (a no-op until both were edited; it
// rewrote itself) and replaced the old version in every .json/.ts/.mjs/.md file, release notes and evidence included.
// It now takes both versions as arguments, replaces a version only where it stands alone, and never rewrites history:
// CHANGELOG.md, docs/release/, docs/community/ and docs/internal/.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bump = await import(pathToFileURL(path.join(ROOT, "scripts", "bump-version.mjs")).href);
const OLD = "9.9.9-test.1";
const NEW = "9.9.9-test.2";

describe("rc2 audit E-09 · scripts/bump-version.mjs", () => {
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
});
