import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// RC1 · `pnpm docs:check` skipped almost every local link: its pattern `[^)http#\s]` excluded the LETTERS h, t and p, so a
// link such as `../../examples/react-wallet` (it has a "t") was never checked, and 6 broken links went unnoticed. This test
// runs the checker on a fixture tree.

const SCRIPT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."), "scripts", "docs-check.mjs");
let root: string;

function write(rel: string, content: string) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}
function run() {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8", timeout: 60_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "hardkas-rc1-docs-check-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
  write("docs/start/target-with-path.md", "# target\n");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("RC1 · docs:check checks every local link", () => {
  it("a broken link whose path contains h, t and p is reported (exit 1)", () => {
    write("docs/guides/page.md", "See [the example](../../examples/react-wallet-htp).\n");
    const r = run();
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("Broken link: ../../examples/react-wallet-htp");
  });

  it("a valid relative link with those letters, an anchor, an external URL and a hash link pass (exit 0)", () => {
    write(
      "docs/guides/page.md",
      "[ok](../start/target-with-path.md#top) [web](https://example.org/path) [hash](#section) [mail](mailto:a@example.org)\n"
    );
    const r = run();
    expect(r.status, r.out).toBe(0);
  });
});
