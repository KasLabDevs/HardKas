import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// RC1 · R3: scripts/check-release-tarballs.mjs audits the tarballs of a release offline. Here it audits tarballs built in
// memory (ustar + gzip, as pnpm pack writes them): a clean one passes, and each defect a publish must never carry fails
// with its own finding. The repository's real tarballs are audited by running the script (rc1 evidence d/27).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { auditTarball, readTarball, MUST_BE_PRIVATE } = await import(pathToFileURL(path.join(ROOT, "scripts", "check-release-tarballs.mjs")).href);

const MIT = readFileSync(path.join(ROOT, "LICENSE"), "utf8");
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
    dependencies: { "@hardkas/core": VERSION, zod: "^3.0.0" },
    ...extra
  };
}

function clean(overrides: Record<string, string | undefined> = {}, pkg = manifest()) {
  const files: Record<string, string | undefined> = {
    "package/package.json": JSON.stringify(pkg, null, 2),
    "package/README.md": "# @hardkas/fixture\n",
    "package/LICENSE": MIT,
    "package/dist/index.js": "export const x = 1;\n",
    "package/dist/index.d.ts": "export declare const x = 1;\n",
    ...overrides
  };
  return tar(Object.fromEntries(Object.entries(files).filter(([, v]) => v !== undefined)) as Record<string, string>);
}

const opts = { releaseVersion: VERSION, published: new Set(["@hardkas/fixture", "@hardkas/core"]), mitText: MIT };
const findings = (tgz: Buffer) => auditTarball(tgz, opts).findings as string[];

describe("RC1 · R3 · scripts/check-release-tarballs.mjs", () => {
  it("reads the entries of a tarball in memory", () => {
    const names = readTarball(clean()).map((e: { name: string }) => e.name);
    expect(names).toEqual(["package/package.json", "package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.d.ts"]);
  });

  it("passes a clean tarball", () => {
    expect(findings(clean())).toEqual([]);
  });

  it("fails a workspace: range, an unpublished @hardkas dependency and another version", () => {
    const f = findings(clean({}, manifest({ dependencies: { "@hardkas/core": "workspace:*", "@hardkas/l2": VERSION, "@hardkas/fixture": "0.0.1" } })));
    expect(f).toContain("dependencies.@hardkas/core = workspace:*");
    expect(f).toContain("dependencies.@hardkas/l2: not a published package");
    expect(f).toContain("dependencies.@hardkas/fixture = 0.0.1, release is 9.9.9-test.1");
  });

  it("fails an install script", () => {
    expect(findings(clean({}, manifest({ scripts: { postinstall: "node evil.js", build: "tsup" } })))).toEqual(["install script postinstall: node evil.js"]);
  });

  it("fails a missing README or LICENSE, another license and a non-MIT LICENSE text", () => {
    expect(findings(clean({ "package/README.md": undefined }))).toContain("no README.md");
    expect(findings(clean({ "package/LICENSE": undefined }))).toContain("no LICENSE");
    expect(findings(clean({}, manifest({ license: "GPL-3.0" })))).toContain('license "GPL-3.0", expected "MIT"');
    expect(findings(clean({ "package/LICENSE": "All rights reserved" }))).toContain("LICENSE is not the MIT text");
  });

  it("fails a manifest target that is not in the tarball and an entry outside `files`", () => {
    expect(findings(clean({ "package/dist/index.d.ts": undefined }))).toContain("manifest target missing from the tarball: dist/index.d.ts");
    expect(findings(clean({ "package/src/index.ts": "export {}\n" }))).toContain('entry not covered by "files": src/index.ts');
    // a `module` field naming a file the build does not emit (found on @hardkas/storage-postgres)
    expect(findings(clean({}, manifest({ module: "dist/index.mjs" })))).toEqual(["manifest target missing from the tarball: dist/index.mjs"]);
  });

  it("accepts a `bin` file outside `files`: npm packs the main and bin files whatever `files` says", () => {
    const pkg = manifest({ bin: { "kaspa-fixture": "./bin/fixture.js" } });
    expect(findings(clean({ "package/bin/fixture.js": "#!/usr/bin/env node\n" }, pkg))).toEqual([]);
  });

  it("fails an .npmrc, an owner audit, a nested tarball and .hardkas state", () => {
    const f = findings(
      clean({
        "package/dist/.npmrc": "registry=https://registry.npmjs.org/\n",
        "package/dist/HARDKAS_MAIN_CAPABILITY_AUDIT.md": "x",
        "package/dist/old.tgz": "x",
        "package/dist/.hardkas/state.json": "{}"
      })
    );
    expect(f).toContain(".npmrc: dist/.npmrc");
    expect(f).toContain("an owner audit: dist/HARDKAS_MAIN_CAPABILITY_AUDIT.md");
    expect(f).toContain("nested tarball: dist/old.tgz");
    expect(f).toContain(".hardkas state: dist/.hardkas/state.json");
  });

  it("fails private paths in any text entry, and allows the CI runner's home", () => {
    const leaky = ["C:\\Users\\someone\\project", "D:\\proyectos\\x", "/home/alice/src", "/Users/bob/src", "C:\\x\\hkl1\\y"];
    for (const p of leaky) {
      expect(findings(clean({ "package/dist/index.js": `export const p = ${JSON.stringify(p)};\n` })).length, p).toBeGreaterThan(0);
    }
    expect(findings(clean({ "package/dist/index.js": 'export const p = "/home/runner/work/x";\n' }))).toEqual([]);
  });

  it("fails token and private-key patterns", () => {
    const npm = "npm_" + "A".repeat(36);
    const gh = "ghp_" + "b".repeat(36);
    const pem = "-----BEGIN " + "PRIVATE KEY-----";
    expect(findings(clean({ "package/dist/index.js": `const t = "${npm}";\n` }))).toContain("an npm token in dist/index.js");
    expect(findings(clean({ "package/dist/index.js": `const t = "${gh}";\n` }))).toContain("a GitHub token in dist/index.js");
    expect(findings(clean({ "package/dist/index.js": `const t = \`${pem}\`;\n` }))).toContain("a PEM private key in dist/index.js");
    expect(findings(clean({ "package/README.md": "//registry.npmjs.org/:_authToken=abc123\n" }))).toContain("an .npmrc _authToken in README.md");
    // a placeholder that reads the token from the environment is not a token
    expect(findings(clean({ "package/README.md": "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n" }))).toEqual([]);
  });

  it("keeps the three packages this release does not publish in its private list", () => {
    expect(MUST_BE_PRIVATE).toEqual(["@hardkas/l2", "@hardkas/ext-l2", "@hardkas/pskt-native"]);
  });

  it("reports a broken archive instead of throwing", () => {
    expect(findings(Buffer.from("not a tarball"))[0]).toMatch(/^not a gzip\/tar archive/);
  });
});
