#!/usr/bin/env node
// check-licenses (INT9 · D2): the licenses of the production dependency tree of every published package, offline.
//
// - The graph comes from pnpm-lock.yaml (importers + snapshots); each package's license and version come from its own
//   package.json in node_modules, resolved the way Node resolves it. A version in node_modules that is not the
//   lockfile's is an error (run `pnpm install --frozen-lockfile --offline` first). Nothing is downloaded.
// - Published = every packages/* manifest without `private: true` (docs/status/versioning.md, "Published packages").
// - Edges: `dependencies` are required; `optionalDependencies` and optional peers (`peerDependenciesMeta.optional`) are
//   optional; a required peer is required. A package reached only through optional edges is optional.
// - Flagged: GPL, AGPL, LGPL (unless an OR alternative is not copyleft) and unknown licenses. A flagged package fails
//   the check when it is required by a published package and is not in DOCUMENTED below. Optional ones are listed,
//   never silently: snarkjs (GPL-3.0) is the optional peer of @hardkas/sdk (packages/sdk/README.md §7).
// - docs/status/dependency-licenses.md is this script's report (`--write`). The check also fails when that report was
//   made from another lockfile (its sha256, CRLF normalised, is in the report).
//
// Usage: node scripts/check-licenses.mjs [--write] [--json]
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const args = new Set(argv);
// --root <dir>: another workspace (the script's own test runs it on a fixture); default: this repository
const rootAt = argv.indexOf("--root");
const ROOT = rootAt >= 0 ? path.resolve(argv[rootAt + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "docs", "status", "dependency-licenses.md");

/** Flagged packages a published package may require anyway, each with the document that says so. Empty today. */
const DOCUMENTED = new Map([]);

// ---------------------------------------------------------------------------
// pnpm-lock.yaml (v9): a small parser for the subset pnpm writes (block mappings, `key: value`, `{}` and `[...]`
// inline values, `- item` lists). It refuses anything else rather than guess.
// ---------------------------------------------------------------------------
function unquote(s) {
  s = s.trim();
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
  return s;
}

function splitKey(content) {
  // a key may be quoted and contain ": " inside the quotes
  if (content.startsWith("'") || content.startsWith('"')) {
    const q = content[0];
    let i = 1;
    for (; i < content.length; i++) {
      if (content[i] === q) {
        if (q === "'" && content[i + 1] === "'") {
          i++;
          continue;
        }
        break;
      }
    }
    const key = unquote(content.slice(0, i + 1));
    const rest = content.slice(i + 1);
    if (!rest.startsWith(":")) throw new Error(`lockfile: unexpected line ${content}`);
    return [key, rest.slice(1).trim()];
  }
  const at = content.indexOf(":");
  if (at < 0) throw new Error(`lockfile: unexpected line ${content}`);
  return [content.slice(0, at), content.slice(at + 1).trim()];
}

function parseLockfile(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (content.startsWith("- ")) {
      if (!Array.isArray(parent.__list)) parent.__list = [];
      parent.__list.push(unquote(content.slice(2)));
      continue;
    }
    const [key, value] = splitKey(content);
    if (value === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else if (value === "{}") {
      parent[key] = {};
    } else {
      parent[key] = unquote(value);
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------
function licenseOf(manifest) {
  if (typeof manifest.license === "string") return manifest.license.trim();
  if (manifest.license && typeof manifest.license.type === "string") return manifest.license.type.trim();
  if (Array.isArray(manifest.licenses) && manifest.licenses.length) {
    return manifest.licenses.map((l) => (typeof l === "string" ? l : l?.type)).filter(Boolean).join(" OR ");
  }
  return "";
}

const COPYLEFT = /\b(A?GPL|LGPL)\b/i;
/** "copyleft", "unknown" or undefined. An OR expression is flagged only when every alternative is copyleft. */
function flagOf(license) {
  if (!license || /^(UNLICENSED|UNKNOWN|SEE LICENSE IN\b)/i.test(license)) return "unknown";
  const alternatives = license.replace(/[()]/g, " ").split(/\s+OR\s+/i);
  if (alternatives.every((alt) => COPYLEFT.test(alt))) return "copyleft";
  return undefined;
}

// ---------------------------------------------------------------------------
// node_modules: Node's lookup (each ancestor's node_modules), following pnpm's links to the real directory
// ---------------------------------------------------------------------------
function lookup(fromDir, name) {
  let dir = fromDir;
  for (;;) {
    if (path.basename(dir) !== "node_modules") {
      const candidate = path.join(dir, "node_modules", ...name.split("/"), "package.json");
      if (existsSync(candidate)) return realpathSync(path.dirname(candidate));
    }
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

const bareVersion = (v) => String(v).replace(/\(.*$/, "");

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------
const lockText = readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8");
const lockSha256 = createHash("sha256").update(lockText.replace(/\r\n/g, "\n")).digest("hex");
const lock = parseLockfile(lockText);
if (lock.lockfileVersion !== "9.0") throw new Error(`pnpm-lock.yaml lockfileVersion ${lock.lockfileVersion}: this script reads 9.0`);
const importers = lock.importers ?? {};
const snapshots = lock.snapshots ?? {};

const workspace = new Map(); // importer path -> manifest
for (const dir of readdirSync(path.join(ROOT, "packages"))) {
  const file = path.join(ROOT, "packages", dir, "package.json");
  if (existsSync(file)) workspace.set(`packages/${dir}`, JSON.parse(readFileSync(file, "utf8")));
}
const published = [...workspace].filter(([, m]) => m.private !== true).sort(([a], [b]) => a.localeCompare(b));

const errors = [];
/** key name@version -> { name, version, license, flag, dir } */
const packagesSeen = new Map();

function readPackage(name, version, fromDir) {
  const key = `${name}@${bareVersion(version)}`;
  if (packagesSeen.has(key)) return packagesSeen.get(key);
  const dir = fromDir ? lookup(fromDir, name) : undefined;
  let info;
  if (!dir) {
    // not in node_modules: a platform binary that is optional here, or an incomplete install (flagged by the caller)
    info = { name, version: bareVersion(version), license: "", flag: undefined, dir: undefined, installed: false };
  } else {
    const m = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    if (m.version !== bareVersion(version)) {
      errors.push(`${name}: node_modules has ${m.version}, the lockfile says ${bareVersion(version)} (run pnpm install --frozen-lockfile --offline)`);
    }
    const license = licenseOf(m);
    info = { name, version: bareVersion(version), license, flag: flagOf(license), dir, installed: true };
  }
  packagesSeen.set(key, info);
  return info;
}

/** Third-party closure of one published package: key -> { info, optional, via } (shortest path kept). */
function closureOf(importerPath) {
  const out = new Map();
  const queue = [];
  const visitedImporters = new Set();

  function enqueueImporter(imp, optional, via) {
    const key = `${imp}|${optional}`;
    if (visitedImporters.has(key) || visitedImporters.has(`${imp}|false`)) return;
    visitedImporters.add(key);
    const entry = importers[imp] ?? {};
    const manifest = workspace.get(imp) ?? {};
    const fromDir = path.join(ROOT, imp);
    const edges = [];
    for (const [name, d] of Object.entries(entry.dependencies ?? {})) edges.push([name, d.version, optional]);
    for (const [name, d] of Object.entries(entry.optionalDependencies ?? {})) edges.push([name, d.version, true]);
    // peers are not in the importer's sections: the version is the one the workspace installed (dev or prod)
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      const installed = entry.dependencies?.[name] ?? entry.devDependencies?.[name] ?? entry.optionalDependencies?.[name];
      const peerOptional = optional || manifest.peerDependenciesMeta?.[name]?.optional === true;
      edges.push([name, installed?.version ?? "(peer, not installed in the workspace)", peerOptional, true]);
    }
    for (const [name, version, edgeOptional, isPeer] of edges) {
      if (String(version).startsWith("link:")) {
        const target = path.posix.normalize(path.posix.join(imp, String(version).slice(5)));
        enqueueImporter(target, edgeOptional, [...via, name]);
        continue;
      }
      queue.push({ name, version, optional: edgeOptional, via: [...via, isPeer ? `${name} (peer)` : name], fromDir });
    }
  }

  enqueueImporter(importerPath, false, []);
  while (queue.length) {
    const { name, version, optional, via, fromDir } = queue.shift();
    const installedVersion = String(version).startsWith("(") ? undefined : version;
    const info = installedVersion ? readPackage(name, installedVersion, fromDir) : { name, version: "-", license: "", flag: "unknown", installed: false };
    const key = `${name}@${info.version}`;
    const prev = out.get(key);
    if (prev && (!prev.optional || optional)) continue; // already reached, as required or as optional
    out.set(key, { info, optional, via });
    if (!installedVersion) continue;
    const snap = snapshots[`${name}@${installedVersion}`] ?? {};
    const childFrom = info.dir ?? fromDir;
    for (const [child, v] of Object.entries(snap.dependencies ?? {})) queue.push({ name: child, version: v, optional, via: [...via, child], fromDir: childFrom });
    for (const [child, v] of Object.entries(snap.optionalDependencies ?? {})) queue.push({ name: child, version: v, optional: true, via: [...via, child], fromDir: childFrom });
  }
  return out;
}

const perPackage = [];
const union = new Map(); // key -> { info, requiredBy:Set, optionalBy:Set }
const violations = [];
const listedFlagged = [];
for (const [imp, manifest] of published) {
  const closure = closureOf(imp);
  let flagged = 0;
  for (const [key, { info, optional, via }] of closure) {
    const u = union.get(key) ?? { info, requiredBy: new Set(), optionalBy: new Set() };
    (optional ? u.optionalBy : u.requiredBy).add(manifest.name);
    union.set(key, u);
    if (!info.installed && !optional) {
      errors.push(`${manifest.name} requires ${key} (via ${via.join(" > ")}), which is not in node_modules: run pnpm install --frozen-lockfile --offline`);
      continue;
    }
    if (!info.flag) continue;
    flagged++;
    const documented = DOCUMENTED.get(info.name);
    const status = optional ? "optional" : documented ? `documented: ${documented}` : "VIOLATION";
    const row = { package: manifest.name, dependency: key, license: info.license || "(none)", flag: info.flag, status, via: via.join(" > ") };
    if (status === "VIOLATION") violations.push(row);
    listedFlagged.push(row);
  }
  const required = [...closure.values()].filter((c) => !c.optional).length;
  perPackage.push({ name: manifest.name, license: manifest.license ?? "(none)", required, optional: closure.size - required, flagged });
  if (manifest.license !== "MIT") violations.push({ package: manifest.name, dependency: manifest.name, license: manifest.license ?? "(none)", flag: "own license", status: "VIOLATION", via: "" });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function report() {
  const md = [];
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  md.push("# Dependency licenses");
  md.push("");
  md.push("> Generated by `pnpm check:licenses --write` (`scripts/check-licenses.mjs`) from `pnpm-lock.yaml` and");
  md.push("> `node_modules`, offline. Do not edit by hand: `pnpm check:licenses` fails when this report was made from");
  md.push("> another lockfile, and when a published package requires a GPL, AGPL, LGPL or unknown license.");
  md.push("");
  md.push(`- Lockfile sha256 (LF): \`${lockSha256}\``);
  md.push(`- Published packages: ${published.length} (all MIT). Third-party packages in their production trees: ${union.size}.`);
  md.push("- Required: reached through `dependencies` (and required peers). Optional: reached only through");
  md.push("  `optionalDependencies` or optional peers; a consumer gets them only by installing them.");
  md.push("- A package that is optional and not installed on the machine that wrote this report (a platform binary) has");
  md.push("  no license read here: it is listed as optional with \"(not read)\".");
  md.push("");
  md.push("## Flagged (GPL, AGPL, LGPL or unknown)");
  md.push("");
  const flaggedUnique = new Map();
  for (const r of listedFlagged) {
    const f = flaggedUnique.get(r.dependency) ?? { ...r, packages: new Set() };
    f.packages.add(r.package);
    if (r.status === "VIOLATION") f.status = "VIOLATION";
    flaggedUnique.set(r.dependency, f);
  }
  if (flaggedUnique.size === 0) md.push("None.");
  else {
    md.push("| Dependency | License | Status | Published packages | Path (from the first one) |");
    md.push("| :-- | :-- | :-- | :-- | :-- |");
    for (const [dep, f] of [...flaggedUnique].sort(([a], [b]) => a.localeCompare(b))) {
      md.push(`| \`${esc(dep)}\` | ${esc(f.license)} | ${esc(f.status)} | ${[...f.packages].sort().map((p) => `\`${p}\``).join(", ")} | ${esc(f.via)} |`);
    }
  }
  md.push("");
  md.push("`snarkjs` is the optional peer dependency of `@hardkas/sdk` (GPL-3.0, as are several of its own dependencies):");
  md.push("installing the SDK does not install it, and without it the Groth16 verifier reports `ZK_ENGINE_UNAVAILABLE`");
  md.push("(`packages/sdk/README.md` §7). Installing it is the consumer's decision.");
  md.push("");
  md.push("## Per published package");
  md.push("");
  md.push("| Package | Own license | Required third-party | Optional third-party | Flagged |");
  md.push("| :-- | :-- | --: | --: | --: |");
  for (const p of perPackage) md.push(`| \`${p.name}\` | ${p.license} | ${p.required} | ${p.optional} | ${p.flagged} |`);
  md.push("");
  md.push("## Every third-party package");
  md.push("");
  md.push("| Package | Version | License | Required by | Optional for |");
  md.push("| :-- | :-- | :-- | --: | --: |");
  for (const [, u] of [...union].sort(([a], [b]) => a.localeCompare(b))) {
    const lic = u.info.installed ? u.info.license || "(none)" : "(not read)";
    md.push(`| \`${esc(u.info.name)}\` | ${esc(u.info.version)} | ${esc(lic)} | ${u.requiredBy.size} | ${u.optionalBy.size - [...u.optionalBy].filter((x) => u.requiredBy.has(x)).length} |`);
  }
  md.push("");
  return md.join("\n");
}

const text = report();
if (args.has("--write")) {
  writeFileSync(REPORT, text);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
}
if (args.has("--json")) {
  console.log(JSON.stringify({ lockSha256, published: perPackage, flagged: listedFlagged, violations, errors }, null, 2));
}

if (!args.has("--write")) {
  if (!existsSync(REPORT)) errors.push(`${path.relative(ROOT, REPORT)} is missing: run pnpm check:licenses --write`);
  else if (!readFileSync(REPORT, "utf8").includes(lockSha256)) {
    errors.push(`${path.relative(ROOT, REPORT)} was made from another pnpm-lock.yaml: run pnpm check:licenses --write`);
  }
}

console.log(`check-licenses: ${published.length} published packages, ${union.size} third-party packages in their production trees.`);
const listedUnique = new Map();
for (const r of listedFlagged.filter((r) => r.status !== "VIOLATION")) listedUnique.set(r.dependency, r);
for (const r of listedUnique.values()) console.log(`  listed  ${r.dependency} ${r.license} (${r.flag}, ${r.status})`);
const notRead = [...union.values()].filter((u) => !u.info.installed).length;
if (notRead) console.log(`  ${notRead} optional packages are not installed on this platform (platform binaries): their licenses were not read.`);
for (const v of violations) console.error(`  VIOLATION ${v.package}: ${v.dependency} ${v.license} (${v.flag}) via ${v.via}`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (violations.length || errors.length) {
  console.error(`check-licenses: FAIL (${violations.length} violations, ${errors.length} errors)`);
  process.exit(1);
}
console.log("check-licenses: PASS");
