import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

describe("Config Commands", () => {
  const tempDir = path.join(process.cwd(), ".hardkas-test-config");

  beforeEach(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  const cliPath = path.resolve(__dirname, "../dist/index.js");

  it("should init a config file", () => {
    const output = execSync(`node "${cliPath}" config init`, {
      cwd: tempDir,
      encoding: "utf-8"
    });
    expect(output).toContain("Created hardkas.config.ts");
    expect(fs.existsSync(path.join(tempDir, "hardkas.config.ts"))).toBe(true);
  });

  it("should refuse to overwrite without --force", () => {
    execSync(`node "${cliPath}" config init`, { cwd: tempDir, stdio: "ignore" });
    try {
      execSync(`node "${cliPath}" config init`, { cwd: tempDir, encoding: "utf-8" });
    } catch (e: unknown) {
      expect(((e as any).stdout) || ((e as any).stderr) || ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))).toContain("already exists");
    }
  });

  it("should repair a missing config file", () => {
    const output = execSync(`node "${cliPath}" config repair`, {
      cwd: tempDir,
      encoding: "utf-8"
    });
    expect(output).toContain("Repaired: Created fresh hardkas.config.ts");
    expect(fs.existsSync(path.join(tempDir, "hardkas.config.ts"))).toBe(true);
  });

  it("should repair an invalid config file by backing it up", () => {
    fs.writeFileSync(
      path.join(tempDir, "hardkas.config.ts"),
      "invalid typescript content"
    );
    const output = execSync(`node "${cliPath}" config repair`, {
      cwd: tempDir,
      encoding: "utf-8"
    });
    expect(output).toContain("Repaired: Created fresh");
    expect(fs.existsSync(path.join(tempDir, "hardkas.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "hardkas.config.ts.backup"))).toBe(true);
  });
});
