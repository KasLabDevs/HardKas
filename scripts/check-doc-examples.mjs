#!/usr/bin/env node
/**
 * BETA-FIX W4 · the SDK examples in the docs compile.
 *
 * Every ```ts / ```typescript / ```js / ```mjs block that imports from `@hardkas/*`, in README.md, docs/**\/*.md
 * (docs/internal excluded) and packages/*\/README.md, is type-checked with the repository's `tsc` against the workspace packages'
 * BUILT type declarations, as a consumer would see them: a temporary project under the OS temp directory links each
 * `@hardkas/<name>` to its package (whose package.json `exports` / `types` point at dist/), so run `pnpm build` first.
 * Each block is its own ES module; a failure is printed as <file>:<line> of the Markdown source.
 *
 * Opt-out, for a block that is deliberately partial: put this on the line before the fence (blank lines allowed):
 *     <!-- doc-example: skip <reason> -->
 * A skip without a reason is an error.
 *
 *   node scripts/check-doc-examples.mjs            check (exit 1 on any failure)
 *   node scripts/check-doc-examples.mjs --list     list the blocks it would check, check nothing
 *   node scripts/check-doc-examples.mjs --keep     keep the temporary project (its path is printed)
 *   node scripts/check-doc-examples.mjs --root <d> check another tree (its own docs/ and packages/; used by its test)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const rootAt = argv.indexOf("--root");
const ROOT = rootAt >= 0 && argv[rootAt + 1] ? path.resolve(argv[rootAt + 1]) : SCRIPT_ROOT;

const LANGS = new Map([
  ["ts", ".ts"],
  ["typescript", ".ts"],
  ["js", ".js"],
  ["mjs", ".mjs"]
]);
const HARDKAS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']@hardkas\/[^"']+["']/;
const SKIP = /^<!--\s*doc-example:\s*skip\b\s*(.*?)\s*-->$/;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function* markdownFiles() {
  function* walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        if (full === path.join(ROOT, "docs", "internal")) continue;
        yield* walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) yield full;
    }
  }
  // the repository README too: its "30 Second SDK Example" is the first code most people copy
  if (fs.existsSync(path.join(ROOT, "README.md"))) yield path.join(ROOT, "README.md");
  yield* walk(path.join(ROOT, "docs"));
  const packages = path.join(ROOT, "packages");
  if (fs.existsSync(packages)) {
    for (const name of fs.readdirSync(packages).sort()) {
      const readme = path.join(packages, name, "README.md");
      if (fs.existsSync(readme)) yield readme;
    }
  }
}

/** The fenced blocks of one Markdown file: { lang, code, line (1-based line of the first code line), skip }. */
function blocksOf(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)(.*)$/.exec(lines[i]);
    if (!open) continue;
    const [, indent, fence, info] = open;
    let j = i + 1;
    const body = [];
    for (; j < lines.length; j++) {
      const close = new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`).exec(lines[j]);
      if (close) break;
      body.push(indent && lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j]);
    }
    let k = i - 1;
    while (k >= 0 && lines[k].trim() === "") k--;
    const skip = k >= 0 ? SKIP.exec(lines[k].trim()) : null;
    blocks.push({ lang: info.toLowerCase(), code: body.join("\n"), line: i + 2, fenceLine: i + 1, skip: skip ? skip[1] : undefined });
    i = j;
  }
  return blocks;
}

function collect() {
  const checked = [];
  const skipped = [];
  const errors = [];
  for (const file of markdownFiles()) {
    for (const b of blocksOf(file)) {
      if (!LANGS.has(b.lang) || !HARDKAS_IMPORT.test(b.code)) continue;
      const where = `${rel(file)}:${b.fenceLine}`;
      if (b.skip !== undefined) {
        if (!b.skip) errors.push(`${where}: "doc-example: skip" needs a reason`);
        else skipped.push({ where, reason: b.skip });
        continue;
      }
      checked.push({ ...b, file, where });
    }
  }
  return { checked, skipped, errors };
}

function workspacePackages() {
  const map = new Map();
  const dir = path.join(ROOT, "packages");
  if (!fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir)) {
    const manifest = path.join(dir, name, "package.json");
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (typeof pkg.name === "string" && pkg.name.startsWith("@hardkas/")) map.set(pkg.name, path.join(dir, name));
  }
  return map;
}

function bareSpecifiers(code) {
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"'./][^"']*)["']/g)) {
    const spec = m[1];
    if (spec.startsWith("node:")) continue;
    out.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
  }
  return out;
}

const links = [];
function link(target, at) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
  links.push(at);
}
function cleanup(dir) {
  // remove the links first, without following them, then the rest
  for (const l of links.reverse()) {
    try {
      fs.unlinkSync(l);
    } catch {
      try {
        fs.rmdirSync(l);
      } catch {
        /* reported below if the directory cannot go */
      }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  const { checked, skipped, errors } = collect();
  if (flag("--list")) {
    for (const b of checked) console.log(`check ${b.where} (${b.lang})`);
    for (const s of skipped) console.log(`skip  ${s.where}: ${s.reason}`);
    for (const e of errors) console.log(`error ${e}`);
    return errors.length ? 1 : 0;
  }

  const packages = workspacePackages();
  const used = new Set();
  const external = new Set();
  for (const b of checked) {
    for (const spec of bareSpecifiers(b.code)) (spec.startsWith("@hardkas/") ? used : external).add(spec);
  }
  for (const name of used) {
    if (!packages.has(name)) errors.push(`an example imports ${name}, which is not a workspace package`);
  }
  // the declarations must be built: a missing types file is a setup error, not a docs error
  const unbuilt = [];
  for (const name of used) {
    const dir = packages.get(name);
    if (!dir) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const types = pkg.types ?? pkg.typings ?? pkg.exports?.["."]?.types;
    if (types && !fs.existsSync(path.join(dir, types))) unbuilt.push(`${name} (${types})`);
  }
  if (unbuilt.length) {
    console.error(`[doc-examples] the type declarations are not built: ${unbuilt.join(", ")}. Run \`pnpm build\` first.`);
    return 2;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-doc-examples-"));
  let status = 0;
  try {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "hardkas-doc-examples", private: true, type: "module" }, null, 2));
    for (const name of used) if (packages.has(name)) link(packages.get(name), path.join(tmp, "node_modules", ...name.split("/")));
    const rootModules = path.join(SCRIPT_ROOT, "node_modules");
    for (const name of [...external, "@types/node"]) {
      const at = path.join(rootModules, ...name.split("/"));
      if (fs.existsSync(at)) link(fs.realpathSync(at), path.join(tmp, "node_modules", ...name.split("/")));
    }

    const files = [];
    checked.forEach((b, i) => {
      const name = `example-${String(i + 1).padStart(3, "0")}${LANGS.get(b.lang)}`;
      b.temp = name;
      fs.writeFileSync(path.join(tmp, name), `${b.code}\n`);
      files.push(name);
    });
    fs.writeFileSync(
      path.join(tmp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            lib: ["ES2023", "DOM", "DOM.Iterable"],
            types: ["node"],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            allowJs: true,
            checkJs: true,
            resolveJsonModule: true,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true
          },
          files
        },
        null,
        2
      )
    );

    const tsc = path.join(SCRIPT_ROOT, "node_modules", "typescript", "lib", "tsc.js");
    const run = files.length
      ? spawnSync(process.execPath, [tsc, "-p", path.join(tmp, "tsconfig.json"), "--pretty", "false"], { cwd: tmp, encoding: "utf8" })
      : { status: 0, stdout: "", stderr: "" };
    const byTemp = new Map(checked.map((b) => [b.temp, b]));
    const failedBlocks = new Set();
    const other = [];
    for (const raw of `${run.stdout}\n${run.stderr}`.split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (!line) continue;
      // tsc may print the file with a directory in front: on macOS the OS temp dir is a symlink (/var -> /private/var), so
      // it is shown relative to the real cwd (../../../var/folders/.../example-001.ts); the basename is what identifies it
      const m = /^(?:.*[\\/])?(example-\d+\.\w+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/.exec(line);
      const block = m && byTemp.get(m[1]);
      if (block) {
        failedBlocks.add(block);
        errors.push(`${rel(block.file)}:${block.line + Number(m[2]) - 1}:${m[3]}: ${m[5]}: ${m[6]}`);
      } else if (/error TS\d+/.test(line) || /^\s/.test(line) === false) other.push(line);
    }
    if (run.status !== 0 && failedBlocks.size === 0) errors.push(`tsc exited ${run.status}:\n${other.join("\n")}`);

    console.log(`[doc-examples] ${checked.length} block(s) checked, ${skipped.length} skipped, ${failedBlocks.size} failing.`);
    for (const s of skipped) console.log(`  skipped ${s.where}: ${s.reason}`);
    if (flag("--keep")) console.log(`  temporary project kept at ${tmp}`);
  } finally {
    if (!flag("--keep")) cleanup(tmp);
  }

  if (errors.length) {
    console.error(`[doc-examples] FAILED: ${errors.length} problem(s). The docs are wrong, not the check: fix the example (or mark a deliberately partial one with <!-- doc-example: skip <reason> -->).`);
    for (const e of errors) console.error(`  ${e}`);
    status = 1;
  } else {
    console.log("[doc-examples] every SDK example compiles against the built packages.");
  }
  return status;
}

process.exitCode = main();
