// RC1 · R3: offline audit of the release tarballs, before any publish. Nothing is installed, downloaded or published.
// (No shebang: it is always run as `node scripts/…`, and its test imports it; on a Windows checkout with autocrlf the
// shebang line ends in "\r" and the test runner's transform refused the file.)
//
//   node scripts/check-release-tarballs.mjs --pack [--pnpm <pnpm.cjs>] [--dir <out>] [--report <file.json>]
//       packs every published package (packages/*, not `private`) from its own directory with pnpm (so `workspace:`
//       ranges are rewritten as on publish) into <out>, then audits the tarballs;
//   node scripts/check-release-tarballs.mjs --dir <dir with .tgz> [--report <file.json>]
//       audits tarballs already packed.
//
// Each tarball fails on: a missing package.json, README.md or LICENSE; a license other than MIT or a LICENSE that is not
// the MIT text; a version other than the root manifest's; a `workspace:`/`link:`/`file:` range; an install script
// (preinstall, install, postinstall); a `main`/`types`/`bin`/`exports` target missing from the tarball; an entry outside
// the manifest's `files` (npm adds package.json, README, LICENSE and the `main`/`bin` files itself); an `.npmrc`, `.env`, key or certificate
// file, nested tarball, `node_modules/` or `.hardkas/` entry, or the owner's audits (HARDKAS_*_AUDIT.md); a private
// path (C:\Users, /Users/<name>, /home/<name>, jrodr, hkl1, D:\proyectos, AppData) or a token/private-key pattern in any
// text entry; a `@hardkas/*` dependency on a package that is not published or not at the release version.
// The run fails too when the published set is empty or when @hardkas/l2, @hardkas/ext-l2 or @hardkas/pskt-native is not
// private (or was packed).
//
// Exit 0: every tarball clean. Exit 1: any finding (all are listed). Exit 2: usage.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MUST_BE_PRIVATE = ["@hardkas/l2", "@hardkas/ext-l2", "@hardkas/pskt-native"];
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
  return { name: pkg.name, version: pkg.version, files: files.length, findings };
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

  if (pack) {
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
    results: results.map(({ tarball, name, version, files, findings }) => ({ tarball, name, version, files, findings }))
  };
  const report = arg("--report");
  if (report) fs.writeFileSync(path.resolve(report), JSON.stringify(summary, null, 2) + "\n");
  console.log(`release ${releaseVersion}: ${published.size} published packages, ${results.length} tarballs, ${failed} with findings, ${problems.length} other problems`);
  return failed || problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
