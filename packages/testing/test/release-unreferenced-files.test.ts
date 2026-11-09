import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// RC2 · P: a release tarball carries only what its entry points reach. The CLI tarball of the RC rehearsal carried
// 539 KB of chunks of an older build that nothing imported (turbo restored its cache over a dirty dist/), and the audit
// did not look for unreferenced files. Here scripts/check-release-tarballs.mjs flags every unreferenced file
// (UNREFERENCED_FILE), follows every reference form a build emits, and accepts the resources the manifest declares, on
// tarballs built in memory as pnpm pack writes them. The real tarballs are audited by running the script (rc2 evidence P).
// The release build and its stamp: release-build-clean.test.ts.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { auditTarball, relativeSpecifiers } = await import(pathToFileURL(path.join(ROOT, "scripts", "check-release-tarballs.mjs")).href);

const MIT = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
const VERSION = "9.9.9-test.1";

function tar(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content, "utf8");
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, "utf8");
    h.write("0000644\0", 100);
    h.write("0000000\0", 108);
    h.write("0000000\0", 116);
    h.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
    h.write("00000000000\0", 136);
    h.write("        ", 148);
    h.write("0", 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function manifest(extra: Record<string, unknown> = {}) {
  return {
    name: "@hardkas/fixture",
    version: VERSION,
    license: "MIT",
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    files: ["dist", "LICENSE", "README.md"],
    ...extra
  };
}

/** A tarball with package.json, README, LICENSE and the given package files ("dist/index.js": "…"). */
function pkgTar(files: Record<string, string>, pkg: Record<string, unknown> = manifest()) {
  const all: Record<string, string> = {
    "package/package.json": JSON.stringify(pkg, null, 2),
    "package/README.md": "# @hardkas/fixture\n",
    "package/LICENSE": MIT
  };
  for (const [k, v] of Object.entries(files)) all[`package/${k}`] = v;
  return tar(all);
}

const opts = { releaseVersion: VERSION, published: new Set(["@hardkas/fixture"]), mitText: MIT };
const findings = (tgz: Buffer) => auditTarball(tgz, opts).findings as string[];
const unreferenced = (tgz: Buffer) => findings(tgz).filter((f) => f.startsWith("UNREFERENCED_FILE"));
const D_TS = "export declare const x = 1;\n";

describe("RC2 · P · UNREFERENCED_FILE in scripts/check-release-tarballs.mjs", () => {
  it("flags a leftover chunk of an older build that nothing imports, and not the chunk the entry imports", () => {
    const stale = "export const old = 'HardKAS never contacts a mainnet node';\n".repeat(10);
    const tgz = pkgTar({
      "dist/index.js": 'import { a } from "./chunk-NEW123.js";\nexport { a };\n',
      "dist/index.d.ts": D_TS,
      "dist/chunk-NEW123.js": "export const a = 1;\n",
      "dist/chunk-OLD456.js": stale
    });
    expect(unreferenced(tgz)).toEqual([
      `UNREFERENCED_FILE: dist/chunk-OLD456.js (${Buffer.byteLength(stale)} bytes) is not reached from the manifest's entry points`
    ]);
    expect(auditTarball(tgz, opts).unreferencedBytes).toBe(Buffer.byteLength(stale));
  });

  it("flags an unreferenced declaration, an orphan source map and a resource no reached file names", () => {
    const tgz = pkgTar({
      "dist/index.js": "export const x = 1;\n",
      "dist/index.d.ts": D_TS,
      "dist/old-runner.d.ts": D_TS,
      "dist/old-runner.js.map": "{}",
      "dist/old-data.json": "{}",
      "dist/old.mjs": "export {};\n",
      "dist/old.cjs": "module.exports = {};\n"
    });
    expect(unreferenced(tgz).map((f) => f.split(" ")[1])).toEqual(["dist/old-runner.d.ts", "dist/old-runner.js.map", "dist/old-data.json", "dist/old.mjs", "dist/old.cjs"]);
  });

  it("passes a clean tarball: the entry, its declaration, nothing else", () => {
    expect(findings(pkgTar({ "dist/index.js": "export const x = 1;\n", "dist/index.d.ts": D_TS }))).toEqual([]);
  });

  // Each reference form a build emits reaches its target: the target alone would be a finding.
  const forms: Array<[string, Record<string, string>]> = [
    ["import … from", { "dist/index.js": 'import { a } from "./a.js";\n', "dist/a.js": "" }],
    ["export * from", { "dist/index.js": 'export * from "./a.js";\n', "dist/a.js": "" }],
    ["export { … } from, single quotes", { "dist/index.js": "export { a } from './a.js';\n", "dist/a.js": "" }],
    ["side-effect import", { "dist/index.js": 'import "./a.js";\n', "dist/a.js": "" }],
    ["dynamic import()", { "dist/index.js": 'const m = await import("./runner-X1.js");\n', "dist/runner-X1.js": "" }],
    ["dynamic import() with a fixed template literal", { "dist/index.js": "const m = await import(`./runner-X1.js`);\n", "dist/runner-X1.js": "" }],
    ["require()", { "dist/index.js": 'const a = require("./a.cjs");\n', "dist/a.cjs": "" }],
    ["require.resolve()", { "dist/index.js": 'const p = require.resolve("./a.cjs");\n', "dist/a.cjs": "" }],
    ["new URL(…, import.meta.url) of a resource", { "dist/index.js": 'const u = new URL("./kaspa_bg.wasm", import.meta.url);\n', "dist/kaspa_bg.wasm": "\0asm" }],
    ["new URL(…, import.meta.url) of a worker", { "dist/index.js": 'new Worker(new URL("./worker.js", import.meta.url));\n', "dist/worker.js": "" }],
    ["an extensionless specifier", { "dist/index.js": 'export * from "./a";\n', "dist/a.js": "" }],
    ["a directory specifier", { "dist/index.js": 'export * from "./lib";\n', "dist/lib/index.js": "" }],
    ["a parent specifier from a nested file", { "dist/index.js": 'export * from "./sub/b.js";\n', "dist/sub/b.js": 'export * from "../a.js";\n', "dist/a.js": "" }],
    ["a declaration's export from \"./a.js\" (→ a.d.ts)", { "dist/index.d.ts": 'export * from "./a.js";\n', "dist/a.d.ts": D_TS }],
    ["a declaration's import(\"./a\").T", { "dist/index.d.ts": 'export declare const t: import("./a").T;\n', "dist/a.d.ts": "export type T = 1;\n" }],
    ["a /// <reference path> in a declaration", { "dist/index.d.ts": '/// <reference path="./globals.d.ts" />\n', "dist/globals.d.ts": "declare const g: 1;\n" }],
    ["a .mjs import from a declaration (→ .d.mts)", { "dist/index.d.ts": 'export * from "./a.mjs";\n', "dist/a.d.mts": D_TS }]
  ];
  for (const [form, files] of forms) {
    it(`reaches a file through ${form}`, () => {
      const base = { "dist/index.js": "export {};\n", "dist/index.d.ts": D_TS };
      expect(findings(pkgTar({ ...base, ...files }))).toEqual([]);
    });
  }

  it("reaches the declaration next to a reached JS file and the source maps of reached files", () => {
    const pkg = manifest({
      main: "./dist/index.cjs",
      module: "./dist/index.js",
      exports: { ".": { import: "./dist/index.js", require: "./dist/index.cjs", types: "./dist/index.d.ts" } }
    });
    const tgz = pkgTar(
      {
        "dist/index.js": "export {};\n//# sourceMappingURL=index.js.map\n",
        "dist/index.js.map": "{}",
        "dist/index.cjs": "module.exports = {};\n",
        "dist/index.cjs.map": "{}",
        "dist/index.d.ts": `${D_TS}//# sourceMappingURL=index.d.ts.map\n`,
        "dist/index.d.ts.map": "{}",
        "dist/index.d.cts": D_TS
      },
      pkg
    );
    expect(findings(tgz)).toEqual([]);
  });

  it("reaches every file a subpath pattern export matches, and only those", () => {
    const pkg = manifest({ exports: { ".": "./dist/index.js", "./*": "./dist/*.js" } });
    const tgz = pkgTar({ "dist/index.js": "", "dist/index.d.ts": D_TS, "dist/query.js": "", "dist/nested/deep.js": "", "dist/other.cjs": "" }, pkg);
    expect(unreferenced(tgz).map((f) => f.split(" ")[1])).toEqual(["dist/other.cjs"]);
  });

  it("reaches the bin file outside `files`, the typesVersions targets and a `browser` entry", () => {
    const pkg = manifest({
      bin: { fixture: "./bin/fixture.js" },
      browser: "./dist/browser.js",
      typesVersions: { "*": { cli: ["./dist/cli.d.ts"] } }
    });
    const tgz = pkgTar(
      {
        "bin/fixture.js": '#!/usr/bin/env node\nimport "../dist/cli.js";\n',
        "dist/index.js": "",
        "dist/index.d.ts": D_TS,
        "dist/cli.js": "",
        "dist/cli.d.ts": D_TS,
        "dist/browser.js": ""
      },
      pkg
    );
    expect(findings(tgz)).toEqual([]);
  });

  it("accepts declared resources: a `files` directory with no entry point, a file `files` names, a resource a reached file names", () => {
    const pkg = manifest({ files: ["dist", "templates", "assets/*.wasm", "LICENSE", "README.md"] });
    const tgz = pkgTar(
      {
        "dist/index.js": 'const schema = readFileSync(join(__dirname, "artifact-schema.json"));\n',
        "dist/index.d.ts": D_TS,
        "dist/artifact-schema.json": "{}",
        "dist/unnamed.json": "{}",
        "templates/app/package.json": "{}",
        "templates/app/src/index.js": "export {};\n",
        "templates/app/README.md": "# app\n",
        "assets/engine.wasm": "\0asm"
      },
      pkg
    );
    // only the resource that nothing names and that sits in the build output directory is left over
    expect(unreferenced(tgz).map((f) => f.split(" ")[1])).toEqual(["dist/unnamed.json"]);
  });

  it("lets no `files` entry excuse a file inside an entry point's directory, not even a glob or the file's own path", () => {
    const pkg = manifest({ files: ["dist/*.js", "dist/index.d.ts", "dist/chunk-NAMED.js", "LICENSE", "README.md"] });
    const tgz = pkgTar({ "dist/index.js": "export {};\n", "dist/index.d.ts": D_TS, "dist/chunk-OLD.js": "", "dist/chunk-NAMED.js": "" }, pkg);
    expect(unreferenced(tgz).map((f) => f.split(" ")[1])).toEqual(["dist/chunk-OLD.js", "dist/chunk-NAMED.js"]);
  });

  it("declares a root-level binary by glob when the entry point sits at the root, but never root-level code", () => {
    const pkg = manifest({ main: "index.js", types: "index.d.ts", exports: undefined, files: ["index.js", "index.d.ts", "*.node", "*.js"] });
    const tgz = pkgTar({ "index.js": "module.exports = load();\n", "index.d.ts": D_TS, "addon.win32-x64-msvc.node": "\0bin", "old.js": "" }, pkg);
    expect(unreferenced(tgz).map((f) => f.split(" ")[1])).toEqual(["old.js"]);
  });

  it("finds the stale chunks in a tarball shaped like the CLI's (bin + exports + templates + lazy runners)", () => {
    const pkg = manifest({
      bin: { hardkas: "./dist/index.js" },
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./public": { types: "./dist/public.d.ts", import: "./dist/public.js" } },
      files: ["dist", "templates", "README.md", "LICENSE"]
    });
    const oldChunk = "x".repeat(503);
    const oldRunner = "y".repeat(238);
    const tgz = pkgTar(
      {
        "dist/index.js": 'import { c } from "./chunk-OWNEW.js";\nconst r = () => import("./doctor-node-diagnosis-OWROYCV5.js");\n',
        "dist/public.js": 'export * from "./chunk-OWNEW.js";\n',
        "dist/index.d.ts": D_TS,
        "dist/public.d.ts": D_TS,
        "dist/chunk-OWNEW.js": "export const c = 1;\n",
        "dist/doctor-node-diagnosis-OWROYCV5.js": 'import { c } from "./chunk-OWNEW.js";\n',
        "dist/chunk-VBUTA5OC.js": oldChunk,
        "dist/doctor-node-diagnosis-IDKVDBTR.js": oldRunner,
        "templates/payment-app/src/transfer.ts": "export {};\n",
        "templates/payment-app/package.json": "{}"
      },
      pkg
    );
    const r = auditTarball(tgz, opts);
    expect(r.findings.map((f: string) => f.split(" ")[1])).toEqual(["dist/chunk-VBUTA5OC.js", "dist/doctor-node-diagnosis-IDKVDBTR.js"]);
    expect(r.unreferencedBytes).toBe(503 + 238);
  });

  it("stops at the package boundary and ignores bare names, URLs with a scheme and template literals with a value", () => {
    expect(relativeSpecifiers('import a from "zod"; import("node:fs"); require("../../../outside.js"); import(`./x-${n}.js`); new URL("https://x/y.js", import.meta.url);')).toEqual([
      "../../../outside.js"
    ]);
    expect(findings(pkgTar({ "dist/index.js": 'export * from "../../outside.js";\n', "dist/index.d.ts": D_TS }))).toEqual([]);
  });
});
