#!/usr/bin/env node
/**
 * diag-wasm.mjs — ¿Qué kaspa-wasm se carga de verdad?
 *
 * Responde a una sola pregunta, con evidencia:
 *   ¿El SDK que resuelve Node en runtime es el 2.0.1 de vendor/ (Toccata),
 *   o el 0.13.0 de npm (noviembre 2023, pre-Crescendo)?
 *
 * Uso:  node scripts/diag-wasm.mjs
 * Sin dependencias. No modifica nada.
 */

import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const require = createRequire(join(ROOT, "package.json"));

// ── util ────────────────────────────────────────────────────────────────
const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
};
const h = (t) => console.log(`\n${C.b("── " + t + " " + "─".repeat(Math.max(0, 66 - t.length)))}`);
const rel = (p) => { try { return relative(ROOT, p) || "."; } catch { return p; } };

function readJson(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

// Marcadores que SOLO existen en el SDK post-Toccata (v2.x)
const TOCCATA_MARKERS = [
  "CovenantBinding",
  "covenantId",
  "withCovenant",
  "computeBudget",
  "covenantsEnabled",
  "OpInputCovenantId",
  "populateGenesisCovenants",
];

function probeDts(pkgDir) {
  const candidates = ["kaspa.d.ts", "index.d.ts", "kaspa_bg.wasm.d.ts"];
  for (const c of candidates) {
    const p = join(pkgDir, c);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    const found = TOCCATA_MARKERS.filter((m) => src.includes(m));
    return { file: c, bytes: src.length, found, missing: TOCCATA_MARKERS.filter((m) => !found.includes(m)) };
  }
  return null;
}

function describePkg(label, pkgDir) {
  if (!pkgDir || !existsSync(pkgDir)) {
    console.log(`${label}: ${C.r("NO ENCONTRADO")}`);
    return null;
  }
  const pj = readJson(join(pkgDir, "package.json"));
  const version = pj?.version ?? "??";
  const probe = probeDts(pkgDir);

  let verdict;
  if (probe && probe.found.length === TOCCATA_MARKERS.length) verdict = C.g("TOCCATA (v2.x) — covenants + computeBudget presentes");
  else if (probe && probe.found.length > 0) verdict = C.y(`PARCIAL — ${probe.found.length}/${TOCCATA_MARKERS.length} marcadores`);
  else if (probe) verdict = C.r("PRE-TOCCATA — sin API de covenants");
  else verdict = C.y("sin .d.ts legible");

  console.log(`${label}`);
  console.log(`   path     ${C.dim(rel(pkgDir))}`);
  console.log(`   version  ${C.b(version)}`);
  if (probe) console.log(`   probe    ${probe.file} (${probe.bytes.toLocaleString()} b)`);
  console.log(`   veredicto ${verdict}`);
  if (probe && probe.missing.length && probe.missing.length < TOCCATA_MARKERS.length) {
    console.log(`   ${C.dim("faltan: " + probe.missing.join(", "))}`);
  }
  return { version, probe, pkgDir };
}

// ── 1. lo que está DECLARADO ────────────────────────────────────────────
h("1. Declarado en package.json (raíz)");
const rootPj = readJson(join(ROOT, "package.json"));
const declared = {};
for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  for (const name of ["kaspa-wasm", "kaspa"]) {
    const v = rootPj?.[field]?.[name];
    if (v) { declared[name] = v; console.log(`   ${field}.${name} = ${C.b(v)}`); }
  }
}
if (!Object.keys(declared).length) console.log(C.dim("   (ninguna declaración directa)"));

// ── 2. overrides / resolutions / .npmrc ─────────────────────────────────
h("2. Overrides y aliasing");
const ov = rootPj?.pnpm?.overrides ?? rootPj?.overrides ?? null;
const res = rootPj?.resolutions ?? null;
if (ov) console.log("   pnpm.overrides: " + JSON.stringify(ov, null, 2).split("\n").join("\n   "));
else console.log(C.dim("   pnpm.overrides: (ninguno)"));
if (res) console.log("   resolutions:    " + JSON.stringify(res));
else console.log(C.dim("   resolutions:    (ninguno)"));

const wsYaml = join(ROOT, "pnpm-workspace.yaml");
if (existsSync(wsYaml)) {
  const y = readFileSync(wsYaml, "utf8");
  const hit = y.split("\n").filter((l) => /override|kaspa|catalog/i.test(l));
  console.log(hit.length ? "   pnpm-workspace.yaml:\n     " + hit.join("\n     ") : C.dim("   pnpm-workspace.yaml: sin menciones a kaspa/overrides"));
}
const npmrc = join(ROOT, ".npmrc");
if (existsSync(npmrc)) console.log("   .npmrc: " + readFileSync(npmrc, "utf8").trim().split("\n").join(" | "));

// ── 3. lo que Node RESUELVE de verdad ───────────────────────────────────
h("3. Lo que Node resuelve en runtime (esto es lo que manda)");
let resolvedDir = null;
try {
  const entry = require.resolve("kaspa-wasm");
  console.log(`   require.resolve('kaspa-wasm') → ${C.dim(rel(entry))}`);
  let d = dirname(entry);
  while (d !== dirname(d) && !existsSync(join(d, "package.json"))) d = dirname(d);
  resolvedDir = d;
} catch (e) {
  console.log(`   ${C.r("require.resolve('kaspa-wasm') FALLÓ")}: ${e.message}`);
}
describePkg("   ", resolvedDir);

// ── 4. el vendorizado ───────────────────────────────────────────────────
h("4. vendor/kaspa-wasm (el que crees que usas)");
describePkg("   ", join(ROOT, "vendor", "kaspa-wasm"));

// ── 5. copias instaladas ────────────────────────────────────────────────
h("5. Copias físicas bajo node_modules");
const seen = new Set();
function scan(dir, depth = 0) {
  if (depth > 4) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.name === "kaspa-wasm" || e.name === "kaspa") {
      const pj = readJson(join(p, "package.json"));
      if (pj?.name && !seen.has(p)) {
        seen.add(p);
        let link = "";
        try { if (statSync(p, { throwIfNoEntry: false }) && e.isSymbolicLink()) link = C.dim(" (symlink)"); } catch {}
        console.log(`   ${pj.name}@${C.b(pj.version)}${link}  ${C.dim(rel(p))}`);
      }
      continue;
    }
    if (e.name === "node_modules" || e.name.startsWith("@") || e.name === ".pnpm") scan(p, depth + 1);
  }
}
scan(join(ROOT, "node_modules"));
if (!seen.size) console.log(C.dim("   (ninguna — ¿falta pnpm install?)"));

// ── 6. quién lo pide ────────────────────────────────────────────────────
h("6. Workspaces que dependen de kaspa-wasm / kaspa");
function walkPkgs(dir, depth = 0) {
  if (depth > 3) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (["node_modules", ".git", "dist", "coverage", ".turbo"].includes(e.name)) continue;
    const p = join(dir, e.name);
    const pj = readJson(join(p, "package.json"));
    if (pj?.name) {
      const hits = [];
      for (const f of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const n of ["kaspa-wasm", "kaspa"]) {
          if (pj[f]?.[n]) hits.push(`${n}@${pj[f][n]} ${C.dim("(" + f + ")")}`);
        }
      }
      if (hits.length) console.log(`   ${pj.name.padEnd(30)} ${hits.join("  ")}`);
    }
    walkPkgs(p, depth + 1);
  }
}
for (const d of ["packages", "apps", "labs", "examples"]) {
  const p = join(ROOT, d);
  if (existsSync(p)) walkPkgs(p, 0);
}

// ── veredicto ───────────────────────────────────────────────────────────
h("VEREDICTO");
const runtime = resolvedDir ? readJson(join(resolvedDir, "package.json"))?.version : null;
const vendor = readJson(join(ROOT, "vendor", "kaspa-wasm", "package.json"))?.version;
console.log(`   runtime resuelve : ${C.b(runtime ?? "??")}`);
console.log(`   vendor tiene     : ${C.b(vendor ?? "??")}`);
if (runtime && vendor && runtime !== vendor) {
  console.log(`\n   ${C.r("DESAJUSTE")}: el código carga ${runtime}, no el ${vendor} vendorizado.`);
  console.log(`   ${C.dim("Si runtime es 0.13.x → SDK de noviembre 2023: sin TX V1, sin covenants,")}`);
  console.log(`   ${C.dim("sin cambios de Crescendo ni Toccata. Ese es el bloqueante real.")}`);
} else if (runtime && vendor) {
  console.log(`\n   ${C.g("COHERENTE")}: runtime y vendor coinciden. El bloqueante está en otra capa.`);
}
console.log("");
