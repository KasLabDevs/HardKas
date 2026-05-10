import { describe, it, expect } from "vitest";
import { findWorkspaceRoot } from "../src/paths";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("findWorkspaceRoot", () => {
  it("should find the workspace root containing pnpm-workspace.yaml", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    const pkgDir = path.join(tempDir, "packages", "cli");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, "pnpm-workspace.yaml"), "");

    const root = findWorkspaceRoot(pkgDir);
    expect(root).toBe(path.resolve(tempDir));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should fallback to process.cwd() if no root indicators are found", () => {
    // This is hard to test deterministically without mocking fs, 
    // but we can test it doesn't crash on a random temp dir.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-empty-"));
    const root = findWorkspaceRoot(tempDir);
    // Since tempDir doesn't have pnpm-workspace.yaml, it will go up to system root and then fallback.
    // The fallback is process.cwd().
    expect(root).toBe(process.cwd());
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
