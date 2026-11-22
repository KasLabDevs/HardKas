// Rewrites one HardKAS release version into the next across the repository's .json/.ts/.mjs/.md files.
//
//   node scripts/bump-version.mjs <old-version> <new-version> [--dry-run]
//
// audit 2026-11-13 E-09: the versions used to be two constants in this file (a no-op until someone edited both, and the
// script rewrote itself), and the replace ran over every file, the history included. Now:
//   - both versions are arguments, each a semver version (x.y.z or x.y.z-pre), and they must differ;
//   - a version is replaced only where it stands alone: "1.2.3-beta.1" does not match inside "1.2.3-beta.10",
//     "11.2.3-beta.1" or "1.2.3-beta.1-notes" (it still matches in "v1.2.3-beta.1", "@1.2.3-beta.1" and
//     "cli-1.2.3-beta.1.tgz"), and "1.2.3" does not match inside "1.2.3-alpha" or "1.2.3+build": a version followed by
//     a pre-release or build suffix is another version (SEO-2026-11-22: release-notes ids such as
//     "release/<version>-notes" were rewritten to pages that do not exist);
//   - history is never rewritten: every CHANGELOG.md, docs/release/ (release notes), docs/community/ (published
//     community packages and their evidence index) and docs/internal/ (local audits and the evidence archive) are
//     skipped, as are node_modules, dist, dist-release, build, coverage, target, tmp, every hidden folder but .github
//     and .agents, and any folder with its own .git (another repository, or a worktree of this one);
//   - it walks the repository root (this script's parent folder), wherever it is run from.
//
// Two modes (SEO-2026-11-22, before HardKAS reaches a final x.y.z version):
//   - a pre-release version (x.y.z-pre, e.g. a beta or an rc) names HardKAS only, so every standalone occurrence of it
//     is replaced ("distinctive" mode);
//   - a final version (x.y.z) is also the version of other tools and formats this repository cites (the pinned
//     SilverScript compiler, artifact and keystore formats, project templates, third-party packages), hundreds of
//     times. Only HardKAS's own references to it are replaced ("anchored" mode): the `version` of the workspace's
//     package.json files, `@hardkas/*` dependency specs, `hardkasVersion` fields, `HARDKAS_*VERSION` constants,
//     `@hardkas/<pkg>@<v>` specs, `hardkas-<pkg>-<v>.tgz` tarballs, `tag v<v>` and "HardKAS <v>" in prose. Every other
//     standalone occurrence is left alone and listed (file:line), to be checked by hand.
// --dry-run lists the files it would change (and, in anchored mode, the occurrences it leaves) and writes nothing.
//
// Exit 0: done (or nothing to change). Exit 2: usage.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
// build output and tool state; git tracks no file under any of these (SEO-2026-11-22: build, coverage, target,
// dist-release and .docusaurus added: walking them took minutes, and their files are regenerated, never bumped)
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "dist-release", "build", "coverage", "target", ".docusaurus", ".turbo", ".git", "tmp"]);
/** Paths (relative to the root, "/"-separated) whose files hold the history of earlier releases. */
export const SKIPPED_PATHS = ["docs/release/", "docs/community/", "docs/internal/"];
const BUMPED_EXT = /\.(json|ts|mjs|md)$/;
const VISIBLE_DOT_DIRS = new Set([".github", ".agents"]);

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
    // SEO-2026-11-22: hidden folders are tool state (.claude, .worktrees and .wrangler hold other checkouts and caches,
    // which the bump rewrote too); only .github and .agents carry tracked files that cite the version
    if (name.startsWith(".") && !VISIBLE_DOT_DIRS.has(name)) return true;
    return SKIPPED_PATHS.some((p) => `${r}/`.startsWith(p));
  }
  if (name.toLowerCase() === "changelog.md") return true;
  if (SKIPPED_PATHS.some((p) => r.startsWith(p))) return true;
  return !BUMPED_EXT.test(name);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** What may follow a standalone version: not a digit, not ".<digit>", not a pre-release or build suffix. */
const VERSION_END = "(?![0-9]|\\.[0-9]|[-+][0-9A-Za-z])";

/** A RegExp of `version` standing alone (not inside a longer version, not followed by a pre-release suffix). */
export function versionPattern(version) {
  return new RegExp(`(?<![0-9.])${escapeRe(version)}${VERSION_END}`, "g");
}

/** "distinctive" for a pre-release version (x.y.z-pre), "anchored" for a final one (x.y.z). */
export function bumpMode(version) {
  return version.includes("-") ? "distinctive" : "anchored";
}

/** The text before (and, for tarballs, after) a version that marks it as HardKAS's own, in any file. */
const ANCHORS = [
  { before: "hardkasVersion[\"']?\\s*[:=]\\s*[\"'`]" }, // hardkasVersion: "<v>", "hardkasVersion": "<v>"
  { before: "\\bHARDKAS(?:_[A-Z0-9]+)*_VERSION\\s*[:=]\\s*[\"'`]" }, // HARDKAS_VERSION = "<v>", HARDKAS_RUNTIME_VERSION
  { before: "@hardkas\\/[a-z0-9-]+@[\\^~]?" }, // @hardkas/cli@<v>
  { before: "\\bhardkas-[a-z0-9-]+-", after: "(?=\\.tgz)" }, // hardkas-cli-<v>.tgz
  { before: "\\btag `?v" }, // tag v<v>
  { before: "\\/releases\\/tag\\/v" }, // .../releases/tag/v<v>
  { before: "\\bHard(?:KAS|Kas) `?v?" }, // HardKAS <v>, HardKAS v<v>, HardKAS `<v>`
  { before: "\\bhardkas:\\s*\\{\\s*version:\\s*[\"']" }, // hardkas: { version: "<v>" }
  { before: "capabilities\\.version\\)\\.toBe\\([\"']" } // capabilities.version).toBe("<v>")
];

function anchoredPattern(version) {
  const alternatives = ANCHORS.map(({ before, after = "" }) => `(?<=${before})${escapeRe(version)}${VERSION_END}${after}`);
  return new RegExp(alternatives.join("|"), "g");
}

/** The pnpm workspace's package directories ("" for the root), from pnpm-workspace.yaml's `packages:` globs. */
function workspaceMatcher(root) {
  const globs = [];
  const file = path.join(root, "pnpm-workspace.yaml");
  if (fs.existsSync(file)) {
    let inPackages = false;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (/^packages:\s*$/.test(raw)) { inPackages = true; continue; }
      if (inPackages && /^\S/.test(raw)) inPackages = false;
      const m = inPackages ? /^\s*-\s*["']?([^"'#]+?)["']?\s*$/.exec(raw) : null;
      if (m) globs.push(m[1]);
    }
  }
  const res = globs.map((g) => new RegExp(`^${g.split("/").map((seg) => (seg === "*" ? "[^/]+" : escapeRe(seg))).join("/")}$`));
  return (dir) => dir === "" || res.some((re) => re.test(dir));
}

/**
 * Anchored mode in a package.json: its own top-level `version` when it is a workspace package (they all follow the
 * root's version), and the spec of every `@hardkas/*` dependency. Nothing else (a template's own version, a
 * third-party dependency) is touched.
 */
function bumpManifest(content, rel, oldVersion, newVersion, isWorkspace) {
  const v = escapeRe(oldVersion);
  let out = content;
  if (isWorkspace(path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel))) {
    // the first "version" key at two-space indentation is the manifest's own (package.json files here use 2 spaces)
    out = out.replace(new RegExp(`^( {2}"version":\\s*")${v}(")`, "m"), `$1${newVersion}$2`);
  }
  out = out.replace(new RegExp(`("@hardkas\\/[a-z0-9-]+":\\s*"[\\^~]?)${v}(")`, "g"), `$1${newVersion}$2`);
  return out;
}

/**
 * Replaces `oldVersion` by `newVersion` under `root`.
 * Returns { mode, changed, leftovers }: the changed files (relative, "/"-separated, sorted) and, in anchored mode, the
 * standalone occurrences left alone ({ file, line, text }).
 */
export function bumpVersionReport(root, oldVersion, newVersion, { dryRun = false } = {}) {
  const mode = bumpMode(oldVersion);
  const standalone = versionPattern(oldVersion);
  const anchored = anchoredPattern(oldVersion);
  const isWorkspace = workspaceMatcher(root);
  const changed = [];
  const leftovers = [];
  const walk = (relDir) => {
    for (const d of fs.readdirSync(path.join(root, relDir), { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${d.name}` : d.name;
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        // a folder with its own .git is another repository or a worktree (another checkout of this one): never ours
        if (!isSkipped(rel, true) && !fs.existsSync(path.join(root, rel, ".git"))) walk(rel);
        continue;
      }
      if (!d.isFile() || isSkipped(rel)) continue;
      const file = path.join(root, rel);
      const content = fs.readFileSync(file, "utf8");
      standalone.lastIndex = 0;
      if (!standalone.test(content)) continue;
      let next;
      if (mode === "distinctive") {
        next = content.replace(standalone, newVersion);
      } else {
        next = d.name === "package.json" ? bumpManifest(content, rel, oldVersion, newVersion, isWorkspace) : content;
        next = next.replace(anchored, newVersion);
        next.split(/\r?\n/).forEach((text, i) => {
          standalone.lastIndex = 0;
          if (standalone.test(text)) leftovers.push({ file: rel, line: i + 1, text: text.trim() });
        });
      }
      if (next === content) continue;
      if (!dryRun) fs.writeFileSync(file, next, "utf8");
      changed.push(rel);
    }
  };
  walk("");
  // the directory order of readdirSync depends on the file system: sort, as the changed files are
  leftovers.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { mode, changed: changed.sort(), leftovers };
}

/** Replaces `oldVersion` by `newVersion` under `root`; returns the changed files (relative, "/"-separated). */
export function bumpVersion(root, oldVersion, newVersion, options = {}) {
  return bumpVersionReport(root, oldVersion, newVersion, options).changed;
}

function main() {
  const args = parseBumpArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`bump-version: ${args.error}`);
    console.error("usage: node scripts/bump-version.mjs <old-version> <new-version> [--dry-run]");
    return 2;
  }
  const { mode, changed, leftovers } = bumpVersionReport(ROOT, args.oldVersion, args.newVersion, { dryRun: args.dryRun });
  for (const f of changed) console.log(`${args.dryRun ? "Would bump" : "Bumped"}: ${f}`);
  console.log(`${args.dryRun ? "Would bump" : "Bumped"} ${args.oldVersion} -> ${args.newVersion} in ${changed.length} files (${mode} mode; skipped: every CHANGELOG.md, ${SKIPPED_PATHS.join(", ")}).`);
  if (mode === "anchored") {
    console.log(
      `\n${args.oldVersion} is a final version, which other tools and formats use too: only HardKAS's own references were ${args.dryRun ? "selected" : "changed"}.`
    );
    if (leftovers.length) {
      console.log(`Left alone (${leftovers.length}); check by hand whether any of them names HardKAS:`);
      for (const l of leftovers) console.log(`  ${l.file}:${l.line}: ${l.text.slice(0, 160)}`);
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
