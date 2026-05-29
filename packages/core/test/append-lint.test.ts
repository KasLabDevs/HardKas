import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walkDir(dir: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
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
      walkDir(filePath, callback);
    } else if (stat.isFile() && /\.(ts|js|tsx|jsx|mts|mjs)$/.test(file)) {
      if (file !== "append-lint.test.ts") {
        callback(filePath);
      }
    }
  }
}

describe("appendFileSync usage static analysis lint check", () => {
  it("should not contain raw appendFileSync without // hardkas-append-allow", () => {
    const rootDir = path.resolve(__dirname, "../../../");
    const violations: string[] = [];

    walkDir(rootDir, (filePath) => {
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

    expect(
      violations,
      `Found raw appendFileSync violations (must use AppendCoordinator in production, or add '// hardkas-append-allow' in tests/scripts):\n${violations.join("\n")}`
    ).toEqual([]);
  });
});
