import { describe, it, expect } from "vitest";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

describe("hardkas new", () => {
  const cliPath = resolve("src/index.ts");
  const tsxBin = resolve("../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";

  function runHardkas(args: string, options: { cwd?: string } = {}) {
    try {
      const stdout = execSync(`${actualTsx} ${cliPath} ${args}`, {
        cwd: options.cwd,
        env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
        encoding: "utf-8"
      });
      return { ok: true, stdout };
    } catch (err: any) {
      return { ok: false, stdout: err.stdout?.toString(), stderr: err.stderr?.toString() };
    }
  }

  it("creates project directory with all files", () => {
    const tmpBase = mkdtempSync(join(tmpdir(), "hardkas-new-"));
    const projectDir = join(tmpBase, "test-project");

    const result = runHardkas(`new test-project --skip-install`, { cwd: tmpBase });
    expect(result.ok).toBe(true);

    expect(existsSync(join(projectDir, "package.json"))).toBe(true);
    expect(existsSync(join(projectDir, "hardkas.config.ts"))).toBe(true);
    expect(existsSync(join(projectDir, ".gitignore"))).toBe(true);
    expect(existsSync(join(projectDir, "scripts/transfer.ts"))).toBe(true);
    expect(existsSync(join(projectDir, "test/transfer.test.ts"))).toBe(true);
    expect(existsSync(join(projectDir, "README.md"))).toBe(true);

    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("refuses to overwrite existing directory", () => {
    const tmpBase = mkdtempSync(join(tmpdir(), "hardkas-new-ovw-"));
    const projectDir = join(tmpBase, "existing");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "file.txt"), "content");

    const result = runHardkas(`new existing --skip-install`, { cwd: tmpBase });
    expect(result.ok).toBe(false);

    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("generated package.json has correct name", () => {
    const tmpBase = mkdtempSync(join(tmpdir(), "hardkas-new-pkg-"));
    runHardkas(`new my-app --skip-install`, { cwd: tmpBase });

    const pkg = JSON.parse(readFileSync(join(tmpBase, "my-app/package.json"), "utf-8"));
    expect(pkg.name).toBe("my-app");

    rmSync(tmpBase, { recursive: true, force: true });
  });
});
