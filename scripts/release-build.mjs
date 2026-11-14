// RC2 · P: the build a release is packed from. `pnpm release:build` (node scripts/release-build.mjs):
//
//   1. deletes the `dist/` of every published package (packages/*, not `private`), so nothing an older build left there
//      survives (it refuses if git tracks a file under one of them);
//   2. builds those packages and their dependencies with `turbo run build --force --concurrency 1`: `--force` ignores
//      turbo's cache, so no task output is restored from it (a cache hit restores its files over the directory without
//      deleting what else is there: that is how 539 KB of stale CLI chunks reached a tarball);
//   3. writes a stamp, node_modules/.cache/hardkas/release-build.json, with the sha256 of every file each published
//      `dist/` holds and a hash of each package's build inputs (package.json, tsup/tsconfig files, src/**).
//
// `node scripts/check-release-tarballs.mjs --pack` packs only when every published `dist/` still matches that stamp,
// file for file, and its inputs are unchanged. Nothing is packed, installed or published here.
//
// The stamp also records the commit (`gitHead`) and whether the tree had uncommitted changes (`gitDirty`). A build of a
// dirty tree still succeeds (local checks use it), but says so, and `--pack` refuses it (rc2 audit E-02) unless it is
// given `--allow-dirty`, which marks its tarballs as not for publishing.
//
// Exit 0: built and stamped. Exit 1: a refusal or a failed build (no stamp is left behind). Exit 2: usage.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RELEASE_BUILD_KIND,
  buildInputsHash,
  distSnapshot,
  publishedPackages,
  releaseBuildStampPath,
  verifyReleaseBuild
} from "./check-release-tarballs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posix = (p) => p.split(path.sep).join("/");

/** Files git tracks under the given directories (relative to root); undefined when git cannot tell (no repository). */
export function trackedFiles(root, relDirs) {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z", "--", ...relDirs], { encoding: "utf8", windowsHide: true });
  if (r.error || r.status !== 0) return undefined;
  return r.stdout.split("\0").filter(Boolean);
}

function gitHead(root) {
  const r = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Whether the working tree has changes git does not ignore (then the stamp's HEAD is not the whole source). */
function gitDirty(root) {
  const r = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26 });
  return r.status === 0 ? r.stdout.trim().length > 0 : null;
}

/** Deletes every published package's dist/ and returns how many files each held. */
export function cleanPublishedDist(packages) {
  const removed = {};
  for (const [name, info] of packages) {
    if (info.private) continue;
    const dist = path.join(info.dir, "dist");
    removed[name] = Object.keys(distSnapshot(info.dir)).length;
    fs.rmSync(dist, { recursive: true, force: true });
    if (fs.existsSync(dist)) throw new Error(`could not delete ${dist}`);
  }
  return removed;
}

/** The stamp of the current dist/ of every published package. */
export function makeStamp(packages, { root = ROOT, version, command, head = null, dirty = null, builtAt = new Date().toISOString() } = {}) {
  const out = { kind: RELEASE_BUILD_KIND, version, builtAt, gitHead: head, gitDirty: dirty, command, packages: {} };
  for (const [name, info] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    if (info.private) continue;
    out.packages[name] = { dir: posix(path.relative(root, info.dir)), inputs: buildInputsHash(info.dir, root), dist: distSnapshot(info.dir) };
  }
  return out;
}

function turboCommand(root) {
  const js = path.join(root, "node_modules", "turbo", "bin", "turbo");
  if (fs.existsSync(js)) return { cmd: process.execPath, pre: [js], shell: false };
  return { cmd: "turbo", pre: [], shell: process.platform === "win32" };
}

async function main() {
  if (process.argv.slice(2).some((a) => a !== "--")) {
    console.error("usage: node scripts/release-build.mjs   (no options: it always cleans every published dist/ and builds with --force)");
    return 2;
  }
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const all = publishedPackages(ROOT);
  const published = [...all].filter(([, v]) => !v.private);
  if (published.length === 0) {
    console.error("release-build: no published package under packages/");
    return 1;
  }

  const stampFile = releaseBuildStampPath(ROOT);
  fs.rmSync(stampFile, { force: true }); // a failed or interrupted run leaves no valid stamp

  const distDirs = published.map(([, v]) => posix(path.relative(ROOT, path.join(v.dir, "dist"))));
  const tracked = trackedFiles(ROOT, distDirs);
  if (tracked === undefined) console.log("release-build: git cannot list tracked files here; deleting dist/ without that check");
  else if (tracked.length) {
    console.error(`release-build: git tracks ${tracked.length} file(s) under a published dist/ (${tracked.slice(0, 5).join(", ")}); refusing to delete them`);
    return 1;
  }

  const removed = cleanPublishedDist(all);
  const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0);
  console.log(`release-build: deleted the dist/ of ${published.length} published packages (${removedTotal} files)`);

  const filters = published.map(([name]) => `--filter=${name}`).sort();
  const args = ["run", "build", "--force", "--concurrency", "1", ...filters];
  const command = `turbo ${args.slice(0, 5).join(" ")} --filter=<each of the ${published.length} published packages>`;
  console.log(`release-build: ${command}`);
  const t = turboCommand(ROOT);
  const r = spawnSync(t.cmd, [...t.pre, ...args], { cwd: ROOT, stdio: "inherit", shell: t.shell, windowsHide: true });
  if (r.error || r.status !== 0) {
    console.error(`release-build: turbo build failed (${r.error ? r.error.message : `exit ${r.status}`}); no stamp written`);
    return 1;
  }

  const empty = published.filter(([, v]) => Object.keys(distSnapshot(v.dir)).length === 0).map(([n]) => n);
  if (empty.length) {
    console.error(`release-build: the build left no dist/ for ${empty.join(", ")}; no stamp written`);
    return 1;
  }

  const stamp = makeStamp(all, { root: ROOT, version, command, head: gitHead(ROOT), dirty: gitDirty(ROOT) });
  fs.mkdirSync(path.dirname(stampFile), { recursive: true });
  fs.writeFileSync(stampFile, JSON.stringify(stamp, null, 2) + "\n");
  const self = verifyReleaseBuild(all, stamp, { releaseVersion: version, root: ROOT });
  if (self.length) {
    fs.rmSync(stampFile, { force: true });
    for (const p of self) console.error(`release-build: ${p}`);
    return 1;
  }
  let files = 0;
  let bytes = 0;
  for (const [, v] of published) {
    for (const f of Object.keys(distSnapshot(v.dir))) {
      files++;
      bytes += fs.statSync(path.join(v.dir, f)).size;
    }
  }
  console.log(`release-build: ${published.length} published packages built from scratch (${files} dist files, ${bytes} bytes); stamp ${posix(path.relative(ROOT, stampFile))}`);
  if (stamp.gitDirty !== false) {
    console.log(
      `release-build: WARNING: ${stamp.gitDirty === true ? "the tree has uncommitted changes" : "git could not tell whether the tree is clean"} (HEAD ${stamp.gitHead ?? "unknown"}); \`check-release-tarballs.mjs --pack\` refuses this build for a release (only --allow-dirty packs it, not for publishing)`
    );
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
