import { execSync } from "node:child_process";
import { test, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";

test("Repository Hygiene: No forbidden scratch/runtime files tracked in git", () => {
  // Ensure we are running from a git repository before asserting
  if (!fs.existsSync(path.join(process.cwd(), ".git"))) {
    console.log("Not a git repository root, skipping git ls-files hygiene check.");
    return;
  }

  const trackedFiles = execSync("git ls-files", { encoding: "utf-8" }).split("\n");
  const forbiddenPatterns = [
    /^\.hardkas\//,
    /^\.hardkas-chaos/,
    /^\.crash-workspace/,
    /^demo-workspace\//,
    /^fix-.*\.js$/,
    /^test-commander\.ts$/,
    /^release-gate\.mjs$/
  ];

  const violations = [];

  for (const file of trackedFiles) {
    if (!file.trim()) continue;
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(file)) {
        violations.push(file);
      }
    }
  }

  expect(violations, `Forbidden files are tracked in git:\n${violations.join("\n")}`).toEqual([]);
});
