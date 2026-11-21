import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// BETA-FIX W4 · scripts/check-doc-examples.mjs type-checks every SDK example of the docs against the built packages.
// This runs it on a fixture tree: a workspace package `@hardkas/fake` (a hand-written declaration, nothing to build)
// and Markdown pages whose ```ts blocks import it. It must name the Markdown file and line of a wrong example, honour
// `<!-- doc-example: skip <reason> -->`, refuse a skip without a reason, and leave blocks that import nothing alone.

const SCRIPT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."), "scripts", "check-doc-examples.mjs");
let root: string;

function write(rel: string, content: string) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}
function run(...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8", timeout: 120_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const FENCE = "```";
const good = `${FENCE}ts\nimport { add } from "@hardkas/fake";\nconst n: number = add(1, 2);\nconsole.log(n);\n${FENCE}\n`;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "hardkas-doc-examples-w4-"));
  write(
    "packages/fake/package.json",
    JSON.stringify({ name: "@hardkas/fake", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.js" } }, types: "./index.d.ts" })
  );
  write("packages/fake/index.d.ts", "export declare function add(a: number, b: number): number;\n");
  write("packages/fake/index.js", "export function add(a, b) { return a + b; }\n");
  write("docs/start/good.md", `# Good\n\nText.\n\n${good}\nA shell block is not checked:\n\n${FENCE}bash\nhardkas tx plan\n${FENCE}\n`);
}, 30_000);
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("BETA-FIX W4 · docs:check-examples", () => {
  it("a correct example and a block that imports no @hardkas package pass (exit 0)", () => {
    write("docs/start/plain.md", `${FENCE}ts\nconst x: string = 1;\n${FENCE}\n`);
    const r = run();
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("1 block(s) checked");
  }, 120_000);

  it("a wrong example fails with the Markdown file and line of the error (exit 1)", () => {
    // line 1 "# Bad", 2 blank, 3 fence, 4 import, 5 the bad call
    write("docs/guides/bad.md", `# Bad\n\n${FENCE}typescript\nimport { add, sub } from "@hardkas/fake";\nconst s: string = add(1, 2);\n${FENCE}\n`);
    const r = run();
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/docs\/guides\/bad\.md:4:\d+: TS2305/); // `sub` is not exported
    expect(r.out).toMatch(/docs\/guides\/bad\.md:5:\d+: TS2322/); // number is not a string
    expect(r.out).not.toContain("docs/start/good.md:");
  }, 120_000);

  it("an example marked skip with a reason is not compiled; a skip without a reason is refused", () => {
    write("docs/guides/partial.md", `<!-- doc-example: skip a deliberately partial fragment -->\n\n${FENCE}ts\nimport { add } from "@hardkas/fake";\nadd(;\n${FENCE}\n`);
    let r = run();
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("skipped docs/guides/partial.md:3: a deliberately partial fragment");

    write("docs/guides/partial.md", `<!-- doc-example: skip -->\n${FENCE}ts\nimport { add } from "@hardkas/fake";\n${FENCE}\n`);
    r = run();
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('docs/guides/partial.md:2: "doc-example: skip" needs a reason');
  }, 120_000);

  it("an unbuilt package is a setup error (exit 2), not a docs failure", () => {
    rmSync(path.join(root, "packages", "fake", "index.d.ts"));
    const r = run();
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("Run `pnpm build` first");
  }, 120_000);
});
