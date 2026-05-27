import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("Repository Hygiene", () => {
  it("ensures no scratch or runtime files are tracked in git", () => {
    try {
      const output = execSync("git ls-files", { encoding: "utf-8" });
      const lines = output.split("\\n");
      const forbiddenPatterns = [
        "(\\\\|/)\\.hardkas($|\\\\|/)",
        "(\\\\|/)\\.hardkas-.*",
        "(\\\\|/)\\.crash-workspace($|\\\\|/)",
        "(\\\\|/)demo-workspace($|\\\\|/)",
        "(\\\\|/)fix-.*\\.js$",
        "(\\\\|/)test-commander\\.ts$",
        "(\\\\|/)release-gate\\.mjs$",
        "(\\\\|/).*\\.log$"
      ].map(p => new RegExp(p));

      const violations: string[] = [];
      for (const file of lines) {
        if (!file.trim()) continue;
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(file)) {
            violations.push(file);
            break;
          }
        }
      }

      expect(violations).toEqual([]);
    } catch (e: any) {
      if (e.message.includes("not a git repository") || e.message.includes("git: command not found")) {
        console.warn("Skipping hygiene test: git not available or not a git repo");
      } else {
        throw e;
      }
    }
  });
});
