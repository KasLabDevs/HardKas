// Rewrites one release version into the next across the repository's .json/.ts/.mjs/.md files.
//
//   node scripts/bump-version.mjs <old-version> <new-version> [--dry-run]
//
// rc2 audit E-09: the versions used to be two constants in this file (a no-op until someone edited both, and the
// script rewrote itself), and the replace ran over every file, the history included. Now:
//   - both versions are arguments, each a semver version (x.y.z or x.y.z-pre), and they must differ;
//   - a version is replaced only where it stands alone: "1.2.3-beta.1" does not match inside "1.2.3-beta.10" or
//     "11.2.3-beta.1" (it still matches in "v1.2.3-beta.1", "@1.2.3-beta.1" and "cli-1.2.3-beta.1.tgz");
//   - history is never rewritten: every CHANGELOG.md, docs/release/ (release notes), docs/community/ (published
//     community packages and their evidence index) and docs/internal/ (local audits and the evidence archive) are
//     skipped, as are node_modules, dist, .turbo, .git, tmp and .tmp* folders;
//   - it walks the repository root (this script's parent folder), wherever it is run from.
// --dry-run lists the files it would change and writes nothing.
//
// Exit 0: done (or nothing to change). Exit 2: usage.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", ".turbo", ".git", "tmp"]);
/** Paths (relative to the root, "/"-separated) whose files hold the history of earlier releases. */
export const SKIPPED_PATHS = ["docs/release/", "docs/community/", "docs/internal/"];
const BUMPED_EXT = /\.(json|ts|mjs|md)$/;

/** The parsed command line: { oldVersion, newVersion, dryRun } or { error }. */
export function parseBumpArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const unknown = argv.filter((a) => a.startsWith("--") && a !== "--dry-run");
  const positional = argv.filter((a) => !a.startsWith("--"));
  if (unknown.length) return { error: `unknown option ${unknown[0]}` };
  if (positional.length !== 2) return { error: "give the old and the new version" };
  const [oldVersion, newVersion] = positional;
  for (const v of positional) if (!SEMVER.test(v)) return { error: `${JSON.stringify(v)} is not a version (x.y.z or x.y.z-pre)` };
  if (oldVersion === newVersion) return { error: `the old and the new version are the same (${oldVersion})` };
  return { oldVersion, newVersion, dryRun };
}

/** Whether a file or folder (relative to the root) is left alone. */
export function isSkipped(rel, isDirectory = false) {
  const r = rel.split(path.sep).join("/");
  const name = r.slice(r.lastIndexOf("/") + 1);
  if (isDirectory) {
    if (SKIP_DIR_NAMES.has(name) || name.startsWith(".tmp")) return true;
    return SKIPPED_PATHS.some((p) => `${r}/`.startsWith(p));
  }
  if (name.toLowerCase() === "changelog.md") return true;
  if (SKIPPED_PATHS.some((p) => r.startsWith(p))) return true;
  return !BUMPED_EXT.test(name);
}

/** A RegExp of `version` standing alone (not inside a longer version). */
export function versionPattern(version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![0-9.])${escaped}(?![0-9]|\\.[0-9])`, "g");
}

/** Replaces `oldVersion` by `newVersion` under `root`; returns the changed files (relative, "/"-separated). */
export function bumpVersion(root, oldVersion, newVersion, { dryRun = false } = {}) {
  const re = versionPattern(oldVersion);
  const changed = [];
  const walk = (relDir) => {
    for (const d of fs.readdirSync(path.join(root, relDir), { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${d.name}` : d.name;
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        if (!isSkipped(rel, true)) walk(rel);
        continue;
      }
      if (!d.isFile() || isSkipped(rel)) continue;
      const file = path.join(root, rel);
      const content = fs.readFileSync(file, "utf8");
      re.lastIndex = 0;
      if (!re.test(content)) continue;
      re.lastIndex = 0;
      if (!dryRun) fs.writeFileSync(file, content.replace(re, newVersion), "utf8");
      changed.push(rel);
    }
  };
  walk("");
  return changed.sort();
}

function main() {
  const args = parseBumpArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`bump-version: ${args.error}`);
    console.error("usage: node scripts/bump-version.mjs <old-version> <new-version> [--dry-run]");
    return 2;
  }
  const changed = bumpVersion(ROOT, args.oldVersion, args.newVersion, { dryRun: args.dryRun });
  for (const f of changed) console.log(`${args.dryRun ? "Would bump" : "Bumped"}: ${f}`);
  console.log(`${args.dryRun ? "Would bump" : "Bumped"} ${args.oldVersion} -> ${args.newVersion} in ${changed.length} files (skipped: every CHANGELOG.md, ${SKIPPED_PATHS.join(", ")}).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
