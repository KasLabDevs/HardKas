// RC1 · R3: offline audit of the release tarballs, before any publish. Nothing is installed, downloaded or published.
// (No shebang: it is always run as `node scripts/…`, and its test imports it; on a Windows checkout with autocrlf the
// shebang line ends in "\r" and the test runner's transform refused the file.)
//
//   node scripts/check-release-tarballs.mjs --pack [--pnpm <pnpm.cjs>] [--dir <out>] [--report <file.json>]
//       packs every published package (packages/*, not `private`) from its own directory with pnpm (so `workspace:`
//       ranges are rewritten as on publish) into <out>, then audits the tarballs. It packs only from the `dist/` that
//       `pnpm release:build` (scripts/release-build.mjs) wrote: without that build's stamp, or when a published package's
//       `dist/` or its build inputs differ from the stamp (a file added, removed or changed since), it packs nothing;
//   node scripts/check-release-tarballs.mjs --dir <dir with .tgz> [--report <file.json>]
//       audits tarballs already packed.
//
// Each tarball fails on: a missing package.json, README.md or LICENSE; a license other than MIT or a LICENSE that is not
// the MIT text; a version other than the root manifest's; a `workspace:`/`link:`/`file:` range; an install script
// (preinstall, install, postinstall); a `main`/`types`/`bin`/`exports` target missing from the tarball; an entry outside
// the manifest's `files` (npm adds package.json, README, LICENSE and the `main`/`bin` files itself); an `.npmrc`, `.env`, key or certificate
// file, nested tarball, `node_modules/` or `.hardkas/` entry, or the owner's audits (HARDKAS_*_AUDIT.md); a private
// path (C:\Users, /Users/<name>, /home/<name>, jrodr, hkl1, D:\proyectos, AppData) or a token/private-key pattern in any
// text entry; a `@hardkas/*` dependency on a package that is not published or not at the release version; a file that
// nothing reaches (UNREFERENCED_FILE, below). With --pack, also a tarball whose `dist/` is not the release build's.
// The run fails too when the published set is empty or when a package of MUST_BE_PRIVATE (@hardkas/l2, @hardkas/ext-l2,
// @hardkas/pskt-native and the 8 without a consumer) is not private (or was packed).
//
// UNREFERENCED_FILE (RC2 · P). A tarball carries only what its entry points reach. The entry points are the manifest's
// `main`, `module`, `browser`, `types`/`typings`, `bin`, `exports` and `typesVersions` targets (a subpath pattern such
// as "./dist/*.js" reaches every file it matches). From each reached JS or declaration file the audit follows its
// relative specifiers: `import`/`export … from`, `import "…"`, `import()`, `require()`, `require.resolve()`,
// `new URL("…", import.meta.url)` and `/// <reference path>`, resolved as Node and TypeScript do (the exact file, then
// .js/.mjs/.cjs/.json/.d.ts and /index.*; "./x.js" in a declaration also reaches "./x.d.ts"). These count as reached
// too, each for its reason:
//   - the declaration next to a reached JS file (x.js → x.d.ts, x.mjs → x.d.mts, x.cjs → x.d.cts): TypeScript looks
//     the types of a resolved JS file up there;
//   - the source map of a reached file (its `sourceMappingURL`, or x.js.map next to x.js): debuggers load it from there;
//   - package.json, README, LICENSE, CHANGELOG at the root: npm packs them itself;
//   - a resource (any other file: JSON, WASM, templates…) whose name a reached file contains;
//   - anything a `files` entry declares outside the directories that hold an entry point: a directory (for the CLI,
//     `templates/`: project scaffolds that `hardkas create` copies by directory and never imports), a file named by
//     itself, or a glob. Inside an entry point's directory (`dist/`) `files` excuses nothing, not even "dist/*.js".
// Any other .js/.mjs/.cjs/.d.ts/.d.mts/.d.cts, source map or resource is a finding. A leftover chunk of an older build
// (a `dist/` that turbo's cache restored over a dirty directory) is exactly that: nothing imports it.
//
// Exit 0: every tarball clean. Exit 1: any finding (all are listed). Exit 2: usage.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The packages this release does not publish: the L2 pair and pskt-native (L1-CORE-1 B5, INT9), and the 8 without a
// consumer (surface audit 2026-11-09; docs/status/versioning.md, "Not published").
export const MUST_BE_PRIVATE = [
  "@hardkas/l2",
  "@hardkas/ext-l2",
  "@hardkas/pskt-native",
  "@hardkas/client",
  "@hardkas/react",
  "@hardkas/wallet-adapter",
  "@hardkas/simulator-adapters",
  "@hardkas/plugin-local-indexer",
  "@hardkas/plugin-rpc-backend",
  "@hardkas/sync-daemon",
  "@hardkas/storage-postgres"
];
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];
const DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];
const ALWAYS_INCLUDED = /^(package\.json|readme(\.[^/]*)?|license(\.[^/]*)?|licence(\.[^/]*)?|changelog(\.[^/]*)?)$/i;
const TEXT_EXT = /\.(js|mjs|cjs|ts|mts|cts|map|json|md|txt|yml|yaml|html|css|sh|ps1|cmd|bat|toml|sil|d\.ts)$|(^|\/)[^./]+$/i;

/** Entry names and contents of an npm tarball (gzip + ustar), in memory, without extracting anything to disk. */
export function readTarball(tgz) {
  const tar = zlib.gunzipSync(tgz);
  const entries = [];
  let longName;
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) => header.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1) || "0";
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    if (type === "x" || type === "g") continue; // pax headers: npm/pnpm do not need them for names under 100 chars
    const prefix = field(345, 155);
    let name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = undefined;
    name = name.replace(/^\.\//, "");
    entries.push({ name, type, size, body: Buffer.from(body) });
  }
  return entries;
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** The files npm packs whatever `files` says: the `main` file and the `bin` files (besides package.json, README, LICENSE). */
function alwaysPacked(pkg) {
  const out = new Set();
  const add = (v) => {
    if (typeof v === "string") out.add(v.replace(/^\.\//, ""));
  };
  add(pkg.main);
  if (typeof pkg.bin === "string") add(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === "object") Object.values(pkg.bin).forEach(add);
  return out;
}

/** Whether a path inside the package is covered by the manifest's `files` (a directory entry covers its subtree). */
function coveredByFiles(rel, files, always = new Set()) {
  if (!Array.isArray(files)) return true; // no `files`: npm packs everything not ignored; checked by the other rules
  if (ALWAYS_INCLUDED.test(rel) || always.has(rel)) return true;
  for (const raw of files) {
    const f = String(raw).replace(/^\.\//, "").replace(/\/+$/, "");
    if (f.startsWith("!")) continue;
    if (rel === f || rel.startsWith(`${f}/`)) return true;
    if (/[*?]/.test(f) && (globToRegExp(f).test(rel) || globToRegExp(`${f}/**`).test(rel))) return true;
  }
  return false;
}

/** Every path a manifest points to (main, module, types, typings, bin, exports), relative and normalized. */
function manifestTargets(pkg) {
  const out = new Set();
  const add = (v) => {
    if (typeof v === "string" && !v.includes("*")) out.add(v.replace(/^\.\//, ""));
  };
  for (const k of ["main", "module", "types", "typings"]) add(pkg[k]);
  if (typeof pkg.bin === "string") add(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === "object") Object.values(pkg.bin).forEach(add);
  const walk = (v) => {
    if (typeof v === "string") add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(pkg.exports);
  return [...out];
}

// ---- reachability (UNREFERENCED_FILE) ----------------------------------------------------------------------------

const CODE_FILE = /\.(?:[mc]?js|d\.[mc]?ts)$/i;
const MAP_FILE = /\.map$/i;
const DECLARATION_OF = [
  [/\.js$/i, ".d.ts"],
  [/\.mjs$/i, ".d.mts"],
  [/\.cjs$/i, ".d.cts"]
];
const SPECIFIER_PATTERNS = [
  // import x from "./a"; export * from "./a"; export { a } from "./a"; import type { A } from "./a"
  /\bfrom\s*(["'`])([^"'`\r\n]+?)\1/g,
  // import "./a" (side effect)
  /\bimport\s*(["'`])([^"'`\r\n]+?)\1/g,
  // import("./a"), also a declaration's import("./a").T
  /\bimport\s*\(\s*(["'`])([^"'`\r\n]+?)\1/g,
  // require("./a"), require.resolve("./a")
  /\brequire(?:\.resolve)?\s*\(\s*(["'`])([^"'`\r\n]+?)\1/g,
  // new URL("./a.wasm", import.meta.url)
  /\bnew\s+URL\s*\(\s*(["'`])([^"'`\r\n]+?)\1\s*,\s*import\.meta\.url/g,
  // /// <reference path="./a.d.ts" />
  /\/\/\/\s*<reference\s+path\s*=\s*(["'])([^"'\r\n]+?)\1/g
];
const SOURCE_MAP_URL = /\/[/*][#@]\s*sourceMappingURL=([^\s'"`*]+)/g;

/** Relative specifiers a JS or declaration file names (bare package names and URLs with a scheme are skipped). */
export function relativeSpecifiers(text) {
  const out = new Set();
  for (const re of SPECIFIER_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const s = m[2];
      if (s.includes("${")) continue; // a template literal with a value: not a fixed path
      if (re.source.startsWith("\\bnew\\s+URL")) {
        if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith("/")) out.add(s); // a URL relative to the module
      } else if (s.startsWith("./") || s.startsWith("../") || s === "." || s === "..") out.add(s);
    }
  }
  return [...out];
}

/** The files of `fileSet` that `spec`, written in the file `fromRel`, can resolve to (all candidates that exist). */
function resolveSpecifier(fromRel, spec, fileSet) {
  const clean = spec.replace(/[?#].*$/, "");
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), clean)).replace(/\/+$/, "");
  if (base.startsWith("..") || path.posix.isAbsolute(base)) return [];
  const candidates = [base];
  for (const ext of [".js", ".mjs", ".cjs", ".json", ".d.ts", ".d.mts", ".d.cts"]) candidates.push(base + ext, `${base}/index${ext}`);
  for (const [re, decl] of DECLARATION_OF) if (re.test(base)) candidates.push(base.replace(re, decl));
  return candidates.filter((c) => fileSet.has(c));
}

/** Converts a manifest subpath pattern ("./dist/*.js") into a RegExp over relative paths (`*` spans "/", as in Node). */
function patternToRegExp(target) {
  const t = target.replace(/^\.\//, "");
  return new RegExp(`^${t.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".+")}$`);
}

/** The entry points of a manifest that exist among `fileSet` (relative paths). */
export function entryPoints(pkg, fileSet) {
  const out = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    if (v.includes("*")) {
      const re = patternToRegExp(v);
      for (const f of fileSet) if (re.test(f)) out.add(f);
      return;
    }
    const rel = path.posix.normalize(v.replace(/^\.\//, ""));
    for (const c of [rel, ...resolveSpecifier("index.js", `./${rel}`, fileSet)]) if (fileSet.has(c)) out.add(c);
  };
  const walk = (v) => {
    if (typeof v === "string") add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const k of ["main", "module", "types", "typings"]) add(pkg[k]);
  if (typeof pkg.browser === "string") add(pkg.browser);
  if (typeof pkg.bin === "string") add(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === "object") Object.values(pkg.bin).forEach(add);
  walk(pkg.exports);
  walk(pkg.typesVersions);
  if (pkg.main === undefined && pkg.exports === undefined) add("index.js"); // npm's default main
  return out;
}

/**
 * Files of a tarball (relative paths, with their bodies) that nothing reaches, as UNREFERENCED_FILE findings.
 * `files` is the list of { rel, body } entries covered by the manifest's `files` (the others are already a finding).
 */
export function unreferencedFiles(pkg, files) {
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const fileSet = new Set(byRel.keys());
  const reached = new Set();
  const queue = [...entryPoints(pkg, fileSet)];
  const entryDirs = new Set(queue.map((f) => (f.includes("/") ? f.slice(0, f.indexOf("/")) : "")));
  const reach = (f) => {
    if (fileSet.has(f) && !reached.has(f)) {
      reached.add(f);
      queue.push(f);
    }
  };
  queue.forEach((f) => reached.add(f));
  const texts = [];
  while (queue.length) {
    const f = queue.pop();
    if (!CODE_FILE.test(f)) continue;
    const text = byRel.get(f).body.toString("utf8");
    texts.push(text);
    for (const spec of relativeSpecifiers(text)) for (const c of resolveSpecifier(f, spec, fileSet)) reach(c);
    for (const [re, decl] of DECLARATION_OF) if (re.test(f) && !/\.d\.[mc]?ts$/i.test(f)) reach(f.replace(re, decl));
    reach(`${f}.map`);
    SOURCE_MAP_URL.lastIndex = 0;
    for (const m of text.matchAll(SOURCE_MAP_URL)) {
      if (m[1].startsWith("data:")) continue;
      reach(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1].replace(/[?#].*$/, ""))));
    }
  }
  /** Whether a `files` entry outside the entry points' directories covers the path (a declared resource). */
  const declared = (rel) =>
    Array.isArray(pkg.files) &&
    pkg.files.some((raw) => {
      const f = String(raw).replace(/^\.\//, "").replace(/\/+$/, "");
      if (!f || f.startsWith("!")) return false;
      const glob = /[*?]/.test(f);
      const top = f.includes("/") ? f.slice(0, f.indexOf("/")) : glob ? "" : f;
      // The directory of an entry point ("dist", or the root for a root-level glob) is build output: every file in it
      // must be reached, whatever `files` says ("dist", "dist/*.js"). At the root only code and maps are held to it.
      if (entryDirs.has(top) && (top !== "" || CODE_FILE.test(rel) || MAP_FILE.test(rel))) return false;
      if (rel === f || rel.startsWith(`${f}/`)) return true;
      return glob && (globToRegExp(f).test(rel) || globToRegExp(`${f}/**`).test(rel));
    });
  const findings = [];
  for (const { rel, body } of files) {
    if (reached.has(rel) || ALWAYS_INCLUDED.test(rel) || declared(rel)) continue;
    if (!CODE_FILE.test(rel) && !MAP_FILE.test(rel)) {
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (texts.some((t) => t.includes(name))) continue; // a resource a reached file names
    }
    findings.push({ rel, size: body.length });
  }
  return findings;
}

const PRIVATE_PATHS = [
  [/[A-Za-z]:[\\/]+Users[\\/]+(?!runneradmin\b)[A-Za-z0-9._-]+/, "a Windows user directory"],
  [/\/Users\/(?!runner\b)[A-Za-z0-9._-]+\//, "a macOS user directory"],
  [/\/home\/(?!runner\b|user\b|node\b)[a-z][a-z0-9._-]*\//, "a Linux home directory"],
  [/\bjrodr\b/i, "the developer's user name"],
  [/\bhkl1\b/i, "a private work directory (hkl1)"],
  [/[A-Za-z]:[\\/]+proyectos\b/i, "a private data directory (proyectos)"],
  [/AppData[\\/]+(Local|Roaming)/i, "an AppData path"]
];
const SECRETS = [
  [/\bnpm_[A-Za-z0-9]{36}\b/, "an npm token"],
  [/_authToken\s*=\s*(?!\$\{)[^\s"'`]+/, "an .npmrc _authToken"],
  [/\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/, "a GitHub token"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, "a PEM private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"]
];
const FORBIDDEN_ENTRY = [
  [/(^|\/)\.npmrc$/i, ".npmrc"],
  [/(^|\/)\.env(\..*)?$/i, ".env file"],
  [/\.(pem|key|p12|pfx|crt|cer|jks|kdbx)$/i, "key or certificate file"],
  [/(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/i, "SSH key"],
  [/\.tgz$/i, "nested tarball"],
  [/(^|\/)node_modules\//, "node_modules"],
  [/(^|\/)\.hardkas\//, ".hardkas state"],
  [/(^|\/)HARDKAS_[A-Z_]*AUDIT[A-Z_]*\.md$/, "an owner audit"],
  [/(^|\/)\.git\//, ".git"]
];

/** Findings of one tarball (strings); empty when it is clean. */
export function auditTarball(tgz, { releaseVersion, published, mitText } = {}) {
  const findings = [];
  let entries;
  try {
    entries = readTarball(tgz);
  } catch (e) {
    return { name: undefined, version: undefined, files: 0, findings: [`not a gzip/tar archive: ${e.message}`] };
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const pkgEntry = byName.get("package/package.json");
  if (!pkgEntry) return { name: undefined, version: undefined, files: entries.length, findings: ["no package/package.json"] };
  let pkg;
  try {
    pkg = JSON.parse(pkgEntry.body.toString("utf8"));
  } catch (e) {
    return { name: undefined, version: undefined, files: entries.length, findings: [`package.json does not parse: ${e.message}`] };
  }

  for (const e of entries) {
    if (!e.name.startsWith("package/")) findings.push(`entry outside package/: ${e.name}`);
    if (e.type === "1" || e.type === "2") findings.push(`link entry: ${e.name}`);
  }
  const files = entries.filter((e) => e.type === "0" || e.type === "").map((e) => ({ ...e, rel: e.name.replace(/^package\//, "") }));

  // identity, version, license
  if (pkg.private) findings.push("manifest is private");
  if (releaseVersion && pkg.version !== releaseVersion) findings.push(`version ${pkg.version}, release is ${releaseVersion}`);
  if (pkg.license !== "MIT") findings.push(`license ${JSON.stringify(pkg.license)}, expected "MIT"`);
  const readme = files.find((f) => /^readme(\.md)?$/i.test(f.rel));
  const license = files.find((f) => /^licen[cs]e(\.md|\.txt)?$/i.test(f.rel));
  if (!readme) findings.push("no README.md");
  else if (readme.size === 0) findings.push("empty README.md");
  if (!license) findings.push("no LICENSE");
  else {
    const text = license.body.toString("utf8");
    if (!/MIT License/.test(text) || !/Permission is hereby granted, free of charge/.test(text)) findings.push("LICENSE is not the MIT text");
    if (mitText && text.replace(/\r\n/g, "\n").trim() !== mitText.replace(/\r\n/g, "\n").trim()) findings.push("LICENSE differs from the repository's LICENSE");
  }

  // dependencies
  for (const field of DEP_FIELDS) {
    for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
      if (/^(workspace|link|file|portal):/.test(String(range))) findings.push(`${field}.${dep} = ${range}`);
      if (field !== "devDependencies" && dep.startsWith("@hardkas/") && published) {
        if (!published.has(dep)) findings.push(`${field}.${dep}: not a published package`);
        else if (releaseVersion && !String(range).includes(releaseVersion)) findings.push(`${field}.${dep} = ${range}, release is ${releaseVersion}`);
      }
    }
  }
  for (const s of INSTALL_SCRIPTS) if (pkg.scripts?.[s]) findings.push(`install script ${s}: ${pkg.scripts[s]}`);

  // targets and files
  for (const t of manifestTargets(pkg)) if (!byName.has(`package/${t}`)) findings.push(`manifest target missing from the tarball: ${t}`);
  const always = alwaysPacked(pkg);
  for (const f of files) if (!coveredByFiles(f.rel, pkg.files, always)) findings.push(`entry not covered by "files": ${f.rel}`);
  const unreferenced = unreferencedFiles(
    pkg,
    files.filter((f) => coveredByFiles(f.rel, pkg.files, always))
  );
  for (const u of unreferenced) findings.push(`UNREFERENCED_FILE: ${u.rel} (${u.size} bytes) is not reached from the manifest's entry points`);

  // content
  for (const f of files) {
    for (const [re, what] of FORBIDDEN_ENTRY) if (re.test(f.rel)) findings.push(`${what}: ${f.rel}`);
    if (!TEXT_EXT.test(f.rel) || f.size > 32 * 1024 * 1024) continue;
    const text = f.body.toString("utf8");
    for (const [re, what] of PRIVATE_PATHS) {
      const m = re.exec(text);
      if (m) findings.push(`${what} in ${f.rel}: ${JSON.stringify(text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20))}`);
    }
    for (const [re, what] of SECRETS) if (re.test(text)) findings.push(`${what} in ${f.rel}`);
  }
  const unreferencedBytes = unreferenced.reduce((n, u) => n + u.size, 0);
  return { name: pkg.name, version: pkg.version, files: files.length, unreferencedBytes, findings, entries: files.map((f) => f.rel) };
}

// ---- the release build's stamp (written by scripts/release-build.mjs) -------------------------------------------

export const RELEASE_BUILD_KIND = "hardkas.release-build.v1";
/** Where the release build leaves its stamp: under node_modules, never inside a package (so it is never packed). */
export const releaseBuildStampPath = (root = ROOT) => path.join(root, "node_modules", ".cache", "hardkas", "release-build.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function listFiles(dir, rel = "", out = []) {
  for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) listFiles(dir, r, out);
    else out.push(r);
  }
  return out;
}

/** sha256 of every file under <pkgDir>/dist, by its path in the package ("dist/…"); {} when there is no dist. */
export function distSnapshot(pkgDir) {
  const dist = path.join(pkgDir, "dist");
  if (!fs.existsSync(dist)) return {};
  const out = {};
  for (const r of listFiles(dist).sort()) out[`dist/${r}`] = sha256(fs.readFileSync(path.join(dist, r)));
  return out;
}

/** One hash over what a package's build reads: package.json, tsup/tsconfig files, src/**, and the root tsconfig.base.json. */
export function buildInputsHash(pkgDir, root = ROOT) {
  const h = createHash("sha256");
  const add = (label, file) => h.update(`${label}\0${sha256(fs.readFileSync(file))}\n`);
  const top = fs.readdirSync(pkgDir).filter((f) => f === "package.json" || /^tsup\.config\.[cm]?[jt]s$/.test(f) || /^tsconfig[^/]*\.json$/.test(f));
  for (const f of top.sort()) add(f, path.join(pkgDir, f));
  if (fs.existsSync(path.join(pkgDir, "src"))) for (const r of listFiles(path.join(pkgDir, "src")).sort()) add(`src/${r}`, path.join(pkgDir, "src", r));
  const base = path.join(root, "tsconfig.base.json");
  if (fs.existsSync(base)) add("<root>/tsconfig.base.json", base);
  return h.digest("hex");
}

export function readReleaseBuildStamp(root = ROOT) {
  const file = releaseBuildStampPath(root);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { kind: "unreadable" };
  }
}

/**
 * Why the published packages' dist/ may not be packed: empty when every published package's dist/ is exactly what the
 * release build wrote (same files, same bytes) and its build inputs are unchanged since. `packages` is
 * publishedPackages(); `stamp` is readReleaseBuildStamp().
 */
export function verifyReleaseBuild(packages, stamp, { releaseVersion, root = ROOT } = {}) {
  const stampRel = path.relative(root, releaseBuildStampPath(root)).split(path.sep).join("/");
  if (!stamp) return [`RELEASE_BUILD_MISSING: no ${stampRel}; run \`pnpm release:build\` first (it deletes every published dist/ and builds without turbo's cache)`];
  if (stamp.kind !== RELEASE_BUILD_KIND) return [`RELEASE_BUILD_MISSING: ${stampRel} is not a release-build stamp; run \`pnpm release:build\``];
  const problems = [];
  if (releaseVersion && stamp.version !== releaseVersion) problems.push(`RELEASE_BUILD_STALE: the release build was for ${stamp.version}, the release is ${releaseVersion}`);
  const published = [...packages].filter(([, v]) => !v.private);
  for (const [name, info] of published) {
    const entry = stamp.packages?.[name];
    if (!entry) {
      problems.push(`RELEASE_BUILD_MISMATCH: ${name} was not built by the release build`);
      continue;
    }
    const now = distSnapshot(info.dir);
    const was = entry.dist ?? {};
    const added = Object.keys(now).filter((f) => !(f in was));
    const removed = Object.keys(was).filter((f) => !(f in now));
    const changed = Object.keys(now).filter((f) => f in was && was[f] !== now[f]);
    const list = (xs) => xs.slice(0, 8).join(", ") + (xs.length > 8 ? ` and ${xs.length - 8} more` : "");
    if (added.length) problems.push(`RELEASE_BUILD_MISMATCH: ${name}: ${added.length} file(s) in dist/ the release build did not write: ${list(added)}`);
    if (removed.length) problems.push(`RELEASE_BUILD_MISMATCH: ${name}: ${removed.length} file(s) of the release build missing from dist/: ${list(removed)}`);
    if (changed.length) problems.push(`RELEASE_BUILD_MISMATCH: ${name}: ${changed.length} file(s) in dist/ changed since the release build: ${list(changed)}`);
    if (entry.inputs !== buildInputsHash(info.dir, root)) problems.push(`RELEASE_BUILD_STALE: ${name}: its sources or build configuration changed since the release build`);
  }
  for (const name of Object.keys(stamp.packages ?? {})) if (!published.some(([n]) => n === name)) problems.push(`RELEASE_BUILD_STALE: the release build has ${name}, which is not published now`);
  return problems;
}

/** The published packages of the workspace (packages/*, not private), by name. */
export function publishedPackages(root = ROOT) {
  const out = new Map();
  const dir = path.join(root, "packages");
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const file = path.join(dir, d.name, "package.json");
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    out.set(pkg.name, { dir: path.join(dir, d.name), private: pkg.private === true });
  }
  return out;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const pack = process.argv.includes("--pack");
  const dir = arg("--dir") ? path.resolve(arg("--dir")) : pack ? path.join(ROOT, "tmp-release-tarballs") : undefined;
  if (!dir) {
    console.error("usage: node scripts/check-release-tarballs.mjs (--pack [--pnpm <pnpm.cjs>] [--dir <out>] | --dir <tarballs>) [--report <file.json>]");
    return 2;
  }
  const releaseVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const mitText = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
  const all = publishedPackages();
  const published = new Set([...all].filter(([, v]) => !v.private).map(([k]) => k));
  const problems = [];

  for (const name of MUST_BE_PRIVATE) {
    if (!all.has(name)) problems.push(`${name}: not in packages/`);
    else if (!all.get(name).private) problems.push(`${name}: must be private in this release`);
  }

  let stamp;
  if (pack) {
    // RC2 · P: pack only the release build's output, never a dist/ that a cache restored over older files.
    stamp = readReleaseBuildStamp();
    const refused = verifyReleaseBuild(all, stamp, { releaseVersion });
    if (refused.length) {
      for (const p of [...problems, ...refused]) console.log(`FAIL ${p}`);
      console.log(`release ${releaseVersion}: nothing packed; the dist/ to pack is not the release build's (\`pnpm release:build\`)`);
      const report = arg("--report");
      if (report) {
        const summary = { kind: "release-tarball-audit", releaseVersion, published: published.size, tarballs: 0, failedTarballs: 0, problems: [...problems, ...refused], results: [] };
        fs.writeFileSync(path.resolve(report), JSON.stringify(summary, null, 2) + "\n");
      }
      return 1;
    }
    console.log(`release build stamp ok: ${published.size} published dist/ unchanged since ${stamp.builtAt}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const pnpm = arg("--pnpm");
    for (const [name, info] of [...all].sort()) {
      if (info.private) continue;
      const cmd = pnpm ? [process.execPath, [pnpm, "pack", "--pack-destination", dir]] : ["pnpm", ["pack", "--pack-destination", dir]];
      const r = spawnSync(cmd[0], cmd[1], { cwd: info.dir, encoding: "utf8", shell: !pnpm && process.platform === "win32", windowsHide: true });
      if (r.status !== 0) problems.push(`${name}: pnpm pack failed (${r.status}): ${(r.stderr || r.stdout || "").trim().slice(-400)}`);
      else console.log(`packed ${name}`);
    }
  }

  const tarballs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".tgz")).sort() : [];
  if (tarballs.length === 0) problems.push(`no tarball in ${dir}`);
  const results = [];
  const seen = new Set();
  for (const t of tarballs) {
    const r = auditTarball(fs.readFileSync(path.join(dir, t)), { releaseVersion, published, mitText });
    results.push({ tarball: t, ...r });
    if (r.name) seen.add(r.name);
    if (r.name && MUST_BE_PRIVATE.includes(r.name)) r.findings.push("this package must not be packed for this release");
    // With --pack: the tarball's dist/ must be the release build's file set, no more and no less.
    if (stamp && r.name && stamp.packages?.[r.name] && r.entries) {
      const built = new Set(Object.keys(stamp.packages[r.name].dist ?? {}));
      const packed = r.entries.filter((e) => e.startsWith("dist/"));
      const extra = packed.filter((e) => !built.has(e));
      const missing = [...built].filter((e) => !packed.includes(e));
      if (extra.length) r.findings.push(`dist/ entries the release build did not write: ${extra.join(", ")}`);
      if (missing.length) r.findings.push(`release build files left out of the tarball: ${missing.join(", ")}`);
    }
    console.log(`${r.findings.length ? "FAIL" : "ok  "} ${t} (${r.name ?? "?"} ${r.version ?? "?"}, ${r.files} files)`);
    for (const f of r.findings) console.log(`       - ${f}`);
  }
  for (const name of published) if (!seen.has(name)) problems.push(`${name}: published package without a tarball in ${dir}`);

  const failed = results.filter((r) => r.findings.length).length;
  for (const p of problems) console.log(`FAIL ${p}`);
  const summary = {
    kind: "release-tarball-audit",
    releaseVersion,
    published: published.size,
    tarballs: results.length,
    failedTarballs: failed,
    problems,
    fromReleaseBuild: stamp ? { builtAt: stamp.builtAt, gitHead: stamp.gitHead, gitDirty: stamp.gitDirty } : undefined,
    results: results.map(({ tarball, name, version, files, unreferencedBytes, findings }) => ({ tarball, name, version, files, unreferencedBytes, findings }))
  };
  const report = arg("--report");
  if (report) fs.writeFileSync(path.resolve(report), JSON.stringify(summary, null, 2) + "\n");
  console.log(`release ${releaseVersion}: ${published.size} published packages, ${results.length} tarballs, ${failed} with findings, ${problems.length} other problems`);
  return failed || problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
