import { describe, it, expect, afterEach } from "vitest";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// rc2 audit E-01, E-02, E-09: `node scripts/check-release-tarballs.mjs --pack` packs only a commit's files.
//   - E-01: a git-ignored event log under packages/cli/templates/ was packed (npm ignores .gitignore when `files` names
//     the directory) and the audit passed it: every packed entry outside dist/ must now be a file git tracks, and
//     .jsonl/.log/.csv entries are scanned for private paths and tokens;
//   - E-02: the release build of a dirty tree, at a commit that was not HEAD, was packed: --pack now refuses a stamp
//     with gitDirty not false, a stamp of another commit, uncommitted changes now and a tree git cannot describe; the
//     report carries each tarball's sha512 in npm's integrity format;
//   - E-09: `--dir` named a folder that --pack emptied whole: it now refuses a folder holding anything but .tgz files.
// The decisions are tested here as functions (the real --pack is proven on a fresh clone of the release commit).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const t = await import(pathToFileURL(path.join(ROOT, "scripts", "check-release-tarballs.mjs")).href);
const MIT = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
const VERSION = "9.9.9-test.1";
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);

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

/** A clean tarball of a package that ships `templates/` beside `dist/`, as @hardkas/cli does, plus `extra` entries. */
function cliLike(extra: Record<string, string> = {}) {
  const pkg = {
    name: "@hardkas/fixture",
    version: VERSION,
    license: "MIT",
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    files: ["dist", "templates", "README.md", "LICENSE"]
  };
  return tar({
    "package/package.json": JSON.stringify(pkg, null, 2),
    "package/README.md": "# @hardkas/fixture\n",
    "package/LICENSE": MIT,
    "package/dist/index.js": "export const x = 1;\n",
    "package/dist/index.d.ts": "export declare const x = 1;\n",
    "package/templates/app/README.md": "# app\n",
    ...extra
  });
}
const findings = (tgz: Buffer) =>
  t.auditTarball(tgz, { releaseVersion: VERSION, published: new Set(["@hardkas/fixture"]), mitText: MIT }).findings as string[];

describe("rc2 audit E-01 · every packed entry outside dist/ is a file git tracks", () => {
  const entries = [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/chunk-ABC.js",
    "templates/payment-app/README.md",
    "templates/payment-app/events.jsonl"
  ];
  const tracked = new Set(["packages/cli/package.json", "packages/cli/README.md", "packages/cli/LICENSE", "packages/cli/templates/payment-app/README.md"]);

  it("flags the git-ignored event log under templates/, and leaves dist/ to the release build's stamp", () => {
    expect(t.untrackedEntries(entries, "packages/cli", tracked)).toEqual(["templates/payment-app/events.jsonl"]);
  });

  it("accepts a new file git does not ignore only with --allow-dirty's untracked set, never an ignored one", () => {
    const withNew = [...entries, "templates/new-app/README.md"];
    expect(t.untrackedEntries(withNew, "packages/cli", tracked)).toEqual(["templates/payment-app/events.jsonl", "templates/new-app/README.md"]);
    expect(t.untrackedEntries(withNew, "packages/cli", tracked, new Set(["packages/cli/templates/new-app/README.md"]))).toEqual([
      "templates/payment-app/events.jsonl"
    ]);
  });

  it("scans .jsonl, .log and .csv entries for private paths (they were skipped)", () => {
    const leak = '{"type":"artifact.written","path":"C:\\\\Users\\\\someone\\\\ws\\\\a.json"}\n';
    expect(findings(cliLike())).toEqual([]);
    for (const ext of ["jsonl", "log", "csv"]) {
      const f = findings(cliLike({ [`package/templates/app/events.${ext}`]: leak }));
      expect(f.some((x) => x.startsWith(`a Windows user directory in templates/app/events.${ext}`)), `${ext}: ${f.join(" | ")}`).toBe(true);
    }
  });

  it("reads the repository's git state: HEAD, tracked files, and the stray event log no longer under templates/", () => {
    if (!fs.existsSync(path.join(ROOT, ".git"))) return; // a source archive without git: readGitState's refusal is tested below
    const g = t.readGitState(ROOT);
    expect(g.available, g.error).toBe(true);
    expect(g.head).toMatch(/^[0-9a-f]{40}$/);
    expect(g.tracked.has("package.json")).toBe(true);
    expect(g.tracked.has("packages/cli/templates/payment-app/README.md")).toBe(true);
    expect(g.tracked.has("packages/cli/templates/payment-app/events.jsonl")).toBe(false);
    expect([...g.untracked].some((f: string) => f.startsWith("node_modules/"))).toBe(false); // ignored files are not "untracked"
  });
});

describe("rc2 audit E-02 · --pack refuses a release build that is not a commit's", () => {
  const clean = { available: true, head: HEAD, changes: [] as string[], tracked: new Set<string>(), untracked: new Set<string>() };
  const stamp = { kind: t.RELEASE_BUILD_KIND, version: VERSION, gitHead: HEAD, gitDirty: false, packages: {} };
  const verify = (s: unknown, g: unknown, allowDirty = false) => t.verifyReleaseProvenance(s, g, { allowDirty }) as string[];

  it("accepts a stamp of a clean tree at HEAD, with no change since", () => {
    expect(verify(stamp, clean)).toEqual([]);
  });

  it("refuses the stamp of a dirty tree, and one that cannot tell", () => {
    expect(verify({ ...stamp, gitDirty: true }, clean)).toEqual([
      "RELEASE_BUILD_DIRTY: the release build ran on a tree with uncommitted changes (gitDirty: true); commit or discard them, then run `pnpm release:build` again"
    ]);
    expect(verify({ ...stamp, gitDirty: null }, clean)[0]).toMatch(/^RELEASE_BUILD_DIRTY: the release build could not tell whether its tree was clean \(gitDirty: null\)/);
    expect(verify({ ...stamp, gitDirty: undefined }, clean)[0]).toMatch(/^RELEASE_BUILD_DIRTY: /);
  });

  it("refuses a stamp of another commit (the case found on the owner's machine: dirty, and not HEAD)", () => {
    expect(verify({ ...stamp, gitHead: OTHER }, clean)).toEqual([
      `RELEASE_BUILD_WRONG_COMMIT: the release build was made at ${OTHER}, HEAD is ${HEAD}; run \`pnpm release:build\` at this commit`
    ]);
    const both = verify({ ...stamp, gitHead: OTHER, gitDirty: true }, clean);
    expect(both.map((p) => p.split(":")[0])).toEqual(["RELEASE_BUILD_DIRTY", "RELEASE_BUILD_WRONG_COMMIT"]);
  });

  it("refuses uncommitted changes made after the release build", () => {
    const p = verify(stamp, { ...clean, changes: [" M packages/cli/templates/app/README.md", "?? packages/cli/templates/app/new.ts"] });
    expect(p).toEqual([
      "RELEASE_TREE_DIRTY: the tree has 2 uncommitted change(s) now (M packages/cli/templates/app/README.md; ?? packages/cli/templates/app/new.ts); a release tarball holds a commit's files only"
    ]);
  });

  it("refuses outside a git checkout, with the reason, instead of crashing", () => {
    expect(verify(stamp, { available: false, error: "fatal: not a git repository (or any of the parent directories): .git" })).toEqual([
      "RELEASE_GIT_UNAVAILABLE: --pack packs only a committed tree and needs git to check it (fatal: not a git repository (or any of the parent directories): .git); pack from a git checkout: a fresh clone of the release commit"
    ]);
    expect(verify(stamp, undefined)[0]).toMatch(/^RELEASE_GIT_UNAVAILABLE: /);
  });

  it("--allow-dirty excuses uncommitted changes only: never another commit or a missing git", () => {
    const dirtyNow = { ...clean, changes: [" M a.ts"] };
    expect(verify({ ...stamp, gitDirty: true }, dirtyNow, true)).toEqual([]);
    expect(verify({ ...stamp, gitDirty: true, gitHead: OTHER }, dirtyNow, true).map((p) => p.split(":")[0])).toEqual(["RELEASE_BUILD_WRONG_COMMIT"]);
    expect(verify(stamp, { available: false, error: "x" }, true).map((p) => p.split(":")[0])).toEqual(["RELEASE_GIT_UNAVAILABLE"]);
  });

  it("leaves a missing stamp to verifyReleaseBuild (RELEASE_BUILD_MISSING) and still checks the tree", () => {
    expect(verify(undefined, clean)).toEqual([]);
    expect(verify(undefined, { ...clean, changes: [" M x"] }).map((p) => p.split(":")[0])).toEqual(["RELEASE_TREE_DIRTY"]);
  });

  it("readGitState refuses a folder outside any git checkout, with git's reason", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-no-git-"));
    const saved = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(dir); // git must not find a checkout above the folder
    try {
      const g = t.readGitState(dir);
      expect(g.available).toBe(false);
      expect(String(g.error)).toMatch(/not a git repository|not installed/i);
      expect(verify(stamp, g)[0]).toMatch(/^RELEASE_GIT_UNAVAILABLE: /);
    } finally {
      if (saved === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("readGitState refuses a folder that is not the top of its checkout (ls-files would describe another tree)", () => {
    if (!fs.existsSync(path.join(ROOT, ".git"))) return;
    const g = t.readGitState(path.join(ROOT, "scripts"));
    expect(g.available).toBe(false);
    expect(String(g.error)).toMatch(/is not the top of its git checkout/);
  });

  it("writes a tarball's sha512 in npm's integrity format", () => {
    // SHA-512("abc"), FIPS 180-2 test vector, in base64
    expect(t.tarballIntegrity(Buffer.from("abc"))).toBe("sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==");
  });
});

describe("rc2 audit E-09 · --pack's output folder may hold only tarballs", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pack-dir-"));
    roots.push(d);
    return d;
  };

  it("accepts a folder that does not exist, an empty one and one of .tgz files", () => {
    const d = tmp();
    expect(t.packDirProblems(path.join(d, "new"))).toEqual([]);
    expect(t.packDirProblems(d)).toEqual([]);
    fs.writeFileSync(path.join(d, "hardkas-core-9.9.9-test.1.tgz"), "x");
    fs.writeFileSync(path.join(d, "OLD.TGZ"), "x");
    expect(t.packDirProblems(d)).toEqual([]);
  });

  it("refuses a folder holding anything else, naming it, and a path that is a file", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "a.tgz"), "x");
    fs.writeFileSync(path.join(d, "notes.txt"), "keep me");
    fs.mkdirSync(path.join(d, "src"));
    const p = t.packDirProblems(d) as string[];
    expect(p).toHaveLength(1);
    expect(p[0]).toBe(
      `PACK_DIR_INVALID: ${d} holds 2 entries that are not a .tgz file (notes.txt, src/); --pack replaces the tarballs in its output folder, so name a new folder or one that holds only .tgz files`
    );
    expect(t.packDirProblems(path.join(d, "notes.txt"))[0]).toMatch(/^PACK_DIR_INVALID: .* exists and is not a directory$/);
    expect(fs.readFileSync(path.join(d, "notes.txt"), "utf8")).toBe("keep me");
  });
});
