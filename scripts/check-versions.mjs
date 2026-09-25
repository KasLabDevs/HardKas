// version:check — two guards, both required by the rc.23 remediation programme:
//
// 1. Workspace version synchronisation (AUD-37): every workspace package that
//    declares a version must carry the root version. Private apps that are never
//    published may be excluded by name (decision Q13(a), 2026-09-25); the
//    exclusion only applies while the package really is `private: true`.
//
// 2. Version freeze (T-VER): the tree may not reference a version newer than
//    the root version anywhere (manifests, code, docs), and version literals in
//    manifests and package sources must equal the root version exactly.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

/** Workspace packages exempt from version synchronisation, with the reason. */
const VERSION_SYNC_EXEMPT = new Map([
  ["@hardkas/docs", "private Docusaurus app (apps/docs); never published; Q13(a) 2026-09-25 / AUD-37"]
]);

const rootPkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const expectedVersion = rootPkg.version;

console.log(`Checking version synchronization across workspace...`);
console.log(`Expected version (from root package.json): ${expectedVersion}`);

let hasErrors = false;
const fail = (message) => {
  console.error(`❌ ${message}`);
  hasErrors = true;
};

// ---------------------------------------------------------------------------
// 1. Workspace manifests
// ---------------------------------------------------------------------------
let workspaces;
try {
  workspaces = JSON.parse(execSync("pnpm ls -r --depth -1 --json", { cwd: rootDir, encoding: "utf8" }));
} catch (e) {
  console.error("Failed to list workspaces with pnpm", e);
  process.exit(1);
}

const workspaceManifests = [];
for (const workspace of workspaces) {
  const pkgPath = path.join(workspace.path, "package.json");
  if (!existsSync(pkgPath)) continue;
  workspaceManifests.push(pkgPath);
  if (path.resolve(workspace.path) === rootDir) continue;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const rel = path.relative(rootDir, workspace.path);
  if (VERSION_SYNC_EXEMPT.has(workspace.name)) {
    if (pkg.private !== true) {
      fail(`${workspace.name} (${rel}) is exempt from version sync but is not private: exemption refused`);
    } else {
      console.log(`   (exempt) ${workspace.name} ${pkg.version} — ${VERSION_SYNC_EXEMPT.get(workspace.name)}`);
    }
    continue;
  }
  if (pkg.version && pkg.version !== expectedVersion) {
    fail(`Version mismatch in ${workspace.name} (${rel})\n   Found:    "${pkg.version}"\n   Expected: "${expectedVersion}"`);
  }
}

// ---------------------------------------------------------------------------
// 2. Version freeze
// ---------------------------------------------------------------------------
const versionShape = /^(\d+)\.(\d+)\.(\d+)-([A-Za-z]+)\.(\d+)$/.exec(expectedVersion);
if (!versionShape) {
  console.log(`\nVersion freeze: root version ${expectedVersion} is not a numbered pre-release; freeze scan limited to manifests.`);
}
const [, major, minor, patch, tag, currentNumber] = versionShape ?? [];
const line = versionShape ? `${major}.${minor}.${patch}` : null;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Full tokens of the product line, e.g. 0.12.0-rc.23
const fullToken = versionShape ? new RegExp(`\\b${escape(line)}-${tag}\\.(\\d+)\\b`, "g") : null;
// Bare pre-release mentions, e.g. rc.24 / rc24 (docs and prose)
const bareToken = versionShape ? new RegExp(`\\b${tag}\\.?(\\d+)\\b`, "gi") : null;

const SKIP_DIRS = new Set(["node_modules", "dist", "dist-release", "coverage", "target", "build"]);
// Hidden directories are tool state, except the two that can carry version references.
const SCANNED_HIDDEN_DIRS = new Set([".github", ".changeset"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".mdx", ".yml", ".yaml", ".txt", ".html"]);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !SCANNED_HIDDEN_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      yield path.join(dir, entry.name);
    }
  }
}

function classify(rel) {
  const parts = rel.split(path.sep);
  if (parts[parts.length - 1] === "package.json") return "manifest";
  if (parts[0] === "packages" && parts[2] === "src") return "code";
  if (parts[0] === "scripts") return "code";
  return "other";
}

const stats = { files: 0, manifests: 0, code: 0, other: 0 };
if (versionShape) {
  console.log(`\nVersion freeze: no reference newer than ${expectedVersion}; manifests and package sources pinned to it exactly.`);
  const manifestSet = new Set(workspaceManifests.map((p) => path.resolve(p)));
  for (const file of walk(rootDir)) {
    if (file === path.join(rootDir, "pnpm-lock.yaml")) continue;
    if (!TEXT_EXT.has(path.extname(file))) continue;
    const rel = path.relative(rootDir, file);
    const kind = classify(rel);
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    stats.files++;
    stats[kind === "manifest" ? "manifests" : kind]++;
    const relPosix = rel.split(path.sep).join("/");

    if (kind === "manifest") {
      if (!manifestSet.has(path.resolve(file))) {
        // Manifests outside the workspace (scratch projects, examples' templates):
        // only newer references are forbidden there.
        checkNewerOnly(text, relPosix);
        continue;
      }
      const pkg = JSON.parse(text);
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
          if (!name.startsWith("@hardkas/")) continue;
          if (/^(workspace|file|link|npm):/.test(spec)) continue;
          if (spec.replace(/^[\^~]/, "") !== expectedVersion) {
            fail(`${relPosix}: ${field}.${name} = "${spec}" (expected ${expectedVersion})`);
          }
        }
      }
      checkNewerOnly(text, relPosix);
      continue;
    }

    if (kind === "code") {
      for (const m of text.matchAll(fullToken)) {
        if (m[0] !== expectedVersion) fail(`${relPosix}: version literal "${m[0]}" must be ${expectedVersion}`);
      }
      continue;
    }

    checkNewerOnly(text, relPosix);
  }
}

function checkNewerOnly(text, relPosix) {
  for (const m of text.matchAll(fullToken)) {
    if (Number(m[1]) > Number(currentNumber)) fail(`${relPosix}: references future version "${m[0]}"`);
  }
  for (const m of text.matchAll(bareToken)) {
    if (Number(m[1]) > Number(currentNumber)) fail(`${relPosix}: references future pre-release "${m[0]}"`);
  }
}

if (versionShape) {
  console.log(`   scanned ${stats.files} text files (${stats.manifests} manifests, ${stats.code} package/script sources, ${stats.other} other)`);
}

if (hasErrors) {
  console.error(`\n❌ Version check failed. All workspace packages must match the root version and nothing may reference a newer one.`);
  process.exit(1);
}

console.log(`\n✨ All workspace packages match version ${expectedVersion} and the tree references no newer version.`);
