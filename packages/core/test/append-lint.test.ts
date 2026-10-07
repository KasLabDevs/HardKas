import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The audit evidence archive is not source: every file there is kept byte for byte (each folder's
// MANIFEST.sha256 hashes it), so a preserved reproduction of an old defect must not fail this lint as if
// it were current code, and cannot be edited to satisfy it. Only that directory is skipped; the rest of
// docs/ and every other .mjs is still scanned.
const EVIDENCE_ARCHIVE = path.join("docs", "internal", "audit", "evidence");

function walkDir(rootDir: string, dir: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (path.relative(rootDir, filePath) === EVIDENCE_ARCHIVE) {
        continue;
      }
      if (
        file === "node_modules" ||
        file === "dist" ||
        file === ".git" ||
        file === ".turbo" ||
        file === "coverage" ||
        file === ".hardkas" ||
        file === ".hardkas-chaos" ||
        file === ".hardkas-chaos-workspace" ||
        file === ".tmp" ||
        file === ".crash-workspace" ||
        file === ".fuzz-workspace"
      ) {
        continue;
      }
      walkDir(rootDir, filePath, callback);
    } else if (stat.isFile() && /\.(ts|js|tsx|jsx|mts|mjs)$/.test(file)) {
      if (file !== "append-lint.test.ts") {
        callback(filePath);
      }
    }
  }
}

function findRawAppends(rootDir: string): string[] {
  const violations: string[] = [];
  walkDir(rootDir, rootDir, (filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes("appendFileSync")) {
        // Check if previous line or current line has the allow comment
        const prevLine = i > 0 ? lines[i - 1]! : "";
        const hasAllowComment =
          prevLine.includes("hardkas-append-allow") ||
          line.includes("hardkas-append-allow");
        if (!hasAllowComment) {
          violations.push(
            `${path.relative(rootDir, filePath)}:L${i + 1} - "${line.trim()}"`
          );
        }
      }
    }
  });
  return violations;
}

describe("appendFileSync usage static analysis lint check", () => {
  it("should not contain raw appendFileSync without // hardkas-append-allow", () => {
    const rootDir = path.resolve(__dirname, "../../../");
    const violations = findRawAppends(rootDir);

    expect(
      violations,
      `Found raw appendFileSync violations (must use AppendCoordinator in production, or add '// hardkas-append-allow' in tests/scripts):\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("skips only the evidence archive: the same raw append is still caught in source, scripts and the rest of docs/", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-append-lint-"));
    try {
      const raw = 'fs.appendFileSync(path.join(out, "run.log"), line + "\\n");\n';
      for (const rel of [
        "packages/demo/src/writer.ts",
        "scripts/record.mjs",
        "docs/internal/audit/notes/record.mjs",
        "docs/internal/audit/evidence/some-case/record.mjs"
      ]) {
        const file = path.join(root, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, raw);
      }
      const flagged = findRawAppends(root).map((v) => v.slice(0, v.indexOf(":L")).replaceAll("\\", "/")).sort();
      expect(flagged).toEqual([
        "docs/internal/audit/notes/record.mjs",
        "packages/demo/src/writer.ts",
        "scripts/record.mjs"
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
