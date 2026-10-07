import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// JSON-STREAM-1 guard: in the active CLI source tree (packages/cli/src) a structured result is never printed with
// `writeLine(JSON.stringify(…))` — under --json writeLine is the diagnostic channel (stderr); results use writeJson.
// The only accepted use is human-mode output that says so on the line before ("human mode only"), e.g. a human
// rendering of a structure. Other uses of JSON.stringify are not this rule's business.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const PATTERN = /writeLine\(\s*JSON\.stringify\(/g;
const HUMAN_ONLY = /human mode only/i;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(ts|mts|tsx)$/.test(e.name) ? [p] : [];
  });
}

function findViolations(files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (const m of text.matchAll(PATTERN)) {
      const line = text.slice(0, m.index).split(/\r?\n/).length; // 1-based line of `writeLine(`
      if (HUMAN_ONLY.test(lines[line - 2] ?? "")) continue;
      found.push(`${path.relative(SRC, file).replace(/\\/g, "/")}:${line}`);
    }
  }
  return found;
}

describe("JSON-STREAM-1 guard · no structured result through writeLine in packages/cli/src", () => {
  it("finds no writeLine(JSON.stringify(…)) outside explicitly human-mode-only output", () => {
    const violations = findViolations(sourceFiles(SRC));
    expect(violations, `structured results must use getOutput().writeJson(…):\n${violations.join("\n")}`).toEqual([]);
  });

  it("the guard catches the pattern, single- or multi-line, and honours only the human-mode marker", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-json-guard-"));
    try {
      const write = (name: string, body: string) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };
      const single = write("a.ts", 'getOutput().writeLine(JSON.stringify(payload, null, 2));\n');
      const multi = write("b.ts", "getOutput().writeLine(\n  JSON.stringify(\n    { a: 1 },\n    null,\n    2\n  )\n);\n");
      const human = write("c.ts", "// Keep stringify for human mode only\noutput.writeLine(JSON.stringify(auditResult, null, 2));\n");
      const fine = write("d.ts", "const text = JSON.stringify(x);\ngetOutput().writeJson(payload);\nfs.writeFileSync(p, JSON.stringify(x));\n");
      expect(findViolations([single, multi, human, fine]).map((v) => v.split("/").pop())).toEqual(["a.ts:1", "b.ts:1"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
