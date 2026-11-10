import { describe, it, expect, afterEach, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// RC2 · P: a release is packed only from a clean build. The CLI tarball of the RC rehearsal carried 539 KB of chunks of
// an older build: turbo's cache hit restored its files over a dist/ that still held them. Here:
//   - `node scripts/check-release-tarballs.mjs --pack` refuses a dist/ that is not exactly what scripts/release-build.mjs
//     wrote (its stamp: every dist file's sha256 and a hash of the build inputs), checked in a temporary workspace;
//   - the release build deletes every published dist/ and leaves the private packages alone;
//   - every published package's build deletes its own output first, so turbo's cache never stores a leftover.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tarballs = await import(pathToFileURL(path.join(ROOT, "scripts", "check-release-tarballs.mjs")).href);
const VERSION = "9.9.9-test.1";

describe("RC2 · P · check-release-tarballs --pack packs only the release build's dist/", () => {
  // loaded here, not at the top, so the build-script checks below still run when this module cannot load
  const loadReleaseBuild = () => import(pathToFileURL(path.join(ROOT, "scripts", "release-build.mjs")).href);
  let releaseBuild: Awaited<ReturnType<typeof loadReleaseBuild>>;
  beforeAll(async () => {
    releaseBuild = await loadReleaseBuild();
  });
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  /** A workspace with one published package (a) and one private package (b), both with a dist/. */
  function workspace() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-release-build-"));
    roots.push(root);
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    write("tsconfig.base.json", "{}\n");
    write("packages/a/package.json", JSON.stringify({ name: "@hardkas/a", version: VERSION, files: ["dist"] }));
    write("packages/a/tsup.config.ts", "export default {};\n");
    write("packages/a/src/index.ts", "export const a = 1;\n");
    write("packages/a/dist/index.js", "export const a = 1;\n");
    write("packages/a/dist/index.d.ts", "export declare const a = 1;\n");
    write("packages/b/package.json", JSON.stringify({ name: "@hardkas/b", version: VERSION, private: true }));
    write("packages/b/dist/index.js", "export {};\n");
    return { root, write, packages: tarballs.publishedPackages(root) };
  }
  type W = ReturnType<typeof workspace>;
  const stampOf = (w: W) => releaseBuild.makeStamp(w.packages, { root: w.root, version: VERSION, command: "test" });
  const verify = (w: W, stamp: unknown) => tarballs.verifyReleaseBuild(w.packages, stamp, { releaseVersion: VERSION, root: w.root }) as string[];

  it("refuses to pack without the release build's stamp", () => {
    const w = workspace();
    const p = verify(w, undefined);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^RELEASE_BUILD_MISSING: no node_modules\/\.cache\/hardkas\/release-build\.json; run `pnpm release:build` first/);
    expect(verify(w, { kind: "something-else" })[0]).toMatch(/^RELEASE_BUILD_MISSING/);
  });

  it("accepts the dist/ the release build stamped, and stamps only published packages", () => {
    const w = workspace();
    const stamp = stampOf(w);
    expect(stamp.kind).toBe(tarballs.RELEASE_BUILD_KIND);
    expect(Object.keys(stamp.packages)).toEqual(["@hardkas/a"]);
    expect(stamp.packages["@hardkas/a"].dir).toBe("packages/a");
    expect(Object.keys(stamp.packages["@hardkas/a"].dist)).toEqual(["dist/index.d.ts", "dist/index.js"]);
    expect(verify(w, stamp)).toEqual([]);
  });

  it("refuses a dist/ that gained a file after the release build (a cache restored over it, or a leftover)", () => {
    const w = workspace();
    const stamp = stampOf(w);
    w.write("packages/a/dist/chunk-VBUTA5OC.js", "old\n");
    expect(verify(w, stamp)).toEqual(["RELEASE_BUILD_MISMATCH: @hardkas/a: 1 file(s) in dist/ the release build did not write: dist/chunk-VBUTA5OC.js"]);
  });

  it("refuses a dist/ whose files changed or went missing since the release build", () => {
    const w = workspace();
    const stamp = stampOf(w);
    w.write("packages/a/dist/index.js", "export const a = 2;\n");
    fs.rmSync(path.join(w.root, "packages/a/dist/index.d.ts"));
    expect(verify(w, stamp)).toEqual([
      "RELEASE_BUILD_MISMATCH: @hardkas/a: 1 file(s) of the release build missing from dist/: dist/index.d.ts",
      "RELEASE_BUILD_MISMATCH: @hardkas/a: 1 file(s) in dist/ changed since the release build: dist/index.js"
    ]);
  });

  it("refuses when a package's sources or build configuration changed since the release build", () => {
    const w = workspace();
    const stamp = stampOf(w);
    w.write("packages/a/src/index.ts", "export const a = 3;\n");
    expect(verify(w, stamp)).toEqual(["RELEASE_BUILD_STALE: @hardkas/a: its sources or build configuration changed since the release build"]);
    const w2 = workspace();
    const s2 = stampOf(w2);
    w2.write("packages/a/tsup.config.ts", "export default { clean: false };\n");
    expect(verify(w2, s2)).toEqual(["RELEASE_BUILD_STALE: @hardkas/a: its sources or build configuration changed since the release build"]);
  });

  it("refuses a stamp of another version or of another published set", () => {
    const w = workspace();
    const stamp = stampOf(w);
    expect(verify(w, { ...stamp, version: "0.0.1" })).toEqual([`RELEASE_BUILD_STALE: the release build was for 0.0.1, the release is ${VERSION}`]);
    expect(verify(w, { ...stamp, packages: {} })).toEqual(["RELEASE_BUILD_MISMATCH: @hardkas/a was not built by the release build"]);
    expect(verify(w, { ...stamp, packages: { ...stamp.packages, "@hardkas/gone": { dist: {}, inputs: "" } } })).toEqual([
      "RELEASE_BUILD_STALE: the release build has @hardkas/gone, which is not published now"
    ]);
  });

  it("deletes every published dist/ before building, and leaves private packages alone", () => {
    const w = workspace();
    w.write("packages/a/dist/chunk-OLD.js", "old\n");
    expect(releaseBuild.cleanPublishedDist(w.packages)).toEqual({ "@hardkas/a": 3 });
    expect(fs.existsSync(path.join(w.root, "packages/a/dist"))).toBe(false);
    expect(tarballs.distSnapshot(path.join(w.root, "packages/b"))).toHaveProperty(["dist/index.js"]);
  });
});

describe("RC2 · P · every published package's build deletes its own output first", () => {
  const packagesDir = path.join(ROOT, "packages");
  const published = fs
    .readdirSync(packagesDir)
    .filter((d) => fs.existsSync(path.join(packagesDir, d, "package.json")))
    .map((d) => ({ dir: path.join(packagesDir, d), pkg: JSON.parse(fs.readFileSync(path.join(packagesDir, d, "package.json"), "utf8")) }))
    .filter(({ pkg }) => !pkg.private);

  it("covers the published set", () => {
    expect(published.length).toBeGreaterThan(0);
  });

  for (const { dir, pkg } of published) {
    it(`${pkg.name}: its build cleans dist/ (so turbo's cache never stores a leftover)`, () => {
      const build: string = pkg.scripts?.build ?? "";
      if (/\btsup\b/.test(build)) {
        const config = ["tsup.config.ts", "tsup.config.mjs", "tsup.config.js"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
        const configCleans = config ? /\bclean\s*:\s*true\b/.test(fs.readFileSync(config, "utf8")) : false;
        expect(/--clean\b/.test(build) || configCleans, `${pkg.name}: "${build}" needs --clean (or clean: true in its tsup config)`).toBe(true);
      } else if (/\btsc\b/.test(build)) {
        expect(build, `${pkg.name}: "${build}" must delete dist before tsc`).toMatch(/rmSync\('dist',\{recursive:true,force:true\}\)"? && tsc/);
      } else {
        throw new Error(`${pkg.name}: unknown build "${build}"; teach this test how it cleans its output`);
      }
    });
  }

  it("the release build is `pnpm release:build`, which deletes the published dist/ and ignores turbo's cache", () => {
    const root = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(root.scripts["release:build"]).toBe("node scripts/release-build.mjs");
    const src = fs.readFileSync(path.join(ROOT, "scripts", "release-build.mjs"), "utf8");
    expect(src).toMatch(/\["run", "build", "--force", "--concurrency", "1", \.\.\.filters\]/);
    expect(src).toMatch(/cleanPublishedDist\(all\)/);
  });
});
