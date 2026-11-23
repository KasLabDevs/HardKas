import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// 1.0.0 · scripts/check-versions.mjs on a STABLE root version (X.Y.Z): the product's own version literals
// (`hardkasVersion`, HARDKAS_VERSION, HARDKAS_RUNTIME_VERSION) must equal the root in package sources and scripts, and none may
// be newer than it anywhere. Before, a non-pre-release root disabled the freeze scan altogether. The script reads the
// repository it lives in, so it runs here from a copy placed in a temporary tree.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = fs.readFileSync(path.join(ROOT, "scripts", "check-versions.mjs"), "utf8");

let tree = "";
const write = (rel: string, text: string) => {
  const f = path.join(tree, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

function runCheck() {
  // the script lists workspaces with `pnpm ls`: a stub `pnpm` on PATH answers with the temporary workspace
  const bin = path.join(tree, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const answer = JSON.stringify([{ name: "root", path: tree }, { name: "@hardkas/core", path: path.join(tree, "packages", "core") }]);
  fs.writeFileSync(path.join(bin, "pnpm.cjs"), `process.stdout.write(${JSON.stringify(answer)});\n`);
  fs.writeFileSync(path.join(bin, "pnpm.cmd"), `@node "%~dp0pnpm.cjs" %*\r\n`);
  fs.writeFileSync(path.join(bin, "pnpm"), `#!/bin/sh\nexec node "$(dirname "$0")/pnpm.cjs" "$@"\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [path.join(tree, "scripts", "check-versions.mjs")], {
    cwd: tree,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

beforeAll(() => {
  tree = fs.mkdtempSync(path.join(os.tmpdir(), "hk-checkver-"));
  write("scripts/check-versions.mjs", SCRIPT);
  write("package.json", JSON.stringify({ name: "root", version: "1.2.3", private: true }));
  write("packages/core/package.json", JSON.stringify({ name: "@hardkas/core", version: "1.2.3" }));
  write("docs/status/versioning.md", "# Versioning\n\n## Published packages\n\n| Package | Why |\n| :-- | :-- |\n| `@hardkas/core` | core |\n\n### Not published\n\n| Package | Why |\n| :-- | :-- |\n");
});
afterAll(() => {
  if (tree) fs.rmSync(tree, { recursive: true, force: true });
});

describe("check-versions on a stable root version", () => {
  it("CV-1 a tree whose own version literals equal the root passes", () => {
    write("packages/core/src/version.ts", `export const HARDKAS_RUNTIME_VERSION = "1.2.3";\n`);
    const r = runCheck();
    expect(r.out).toMatch(/Version freeze \(stable 1\.2\.3\)/);
    expect(r.status, r.out).toBe(0);
  });

  it("CV-2 a package source that still carries an older literal fails, naming the file", () => {
    write("packages/core/src/version.ts", `export const HARDKAS_RUNTIME_VERSION = "1.2.2";\n`);
    const r = runCheck();
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/packages\/core\/src\/version\.ts: version literal "1\.2\.2" must be 1\.2\.3/);
  });

  it("CV-3 a literal NEWER than the root fails anywhere, a document included", () => {
    write("packages/core/src/version.ts", `export const HARDKAS_RUNTIME_VERSION = "1.2.3";\n`);
    write("docs/guide.md", `{ "hardkasVersion": "1.3.0" }\n`);
    const r = runCheck();
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/docs\/guide\.md: version literal "1\.3\.0" is newer than the root version 1\.2\.3/);
    fs.rmSync(path.join(tree, "docs", "guide.md"));
  });

  it("CV-4 a dependency's version in a document is not mistaken for the product's", () => {
    write("docs/deps.md", `rusty-kaspa 9.9.9, version: 9.9.9\n`);
    const r = runCheck();
    expect(r.status, r.out).toBe(0);
  });
});
