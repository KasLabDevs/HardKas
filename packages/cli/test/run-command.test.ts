import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, join } from "node:path";
import { writeFileSync, unlinkSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

describe("hardkas run", () => {
  const cliPath = resolve(__dirname, "../src/index.ts");
  const tsxBin = resolve(__dirname, "../../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";
  // REMED-CLOSE · test isolation: `run` writes its wrapper in the workspace's .hardkas and starts it with the
  // workspace's tsx (node_modules/.bin/tsx), importing the workspace's @hardkas/testing, as an installed project has
  // them. Every run here starts in a temporary workspace of its own that links those two from this repository, never
  // in the repository root.
  let cwd = "";
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), "hk-cli-run-"));
    const modules = join(cwd, "node_modules");
    mkdirSync(join(modules, "@hardkas"), { recursive: true });
    mkdirSync(join(modules, ".bin"));
    symlinkSync(resolve(__dirname, "../../testing"), join(modules, "@hardkas", "testing"), "junction");
    if (process.platform === "win32") {
      writeFileSync(join(modules, ".bin", "tsx"), ""); // what `run` looks for; cmd.exe starts tsx.cmd
      writeFileSync(join(modules, ".bin", "tsx.cmd"), `@"${tsxBin}.CMD" %*\r\n`);
    } else {
      writeFileSync(join(modules, ".bin", "tsx"), `#!/bin/sh\nexec "${tsxBin}" "$@"\n`, { mode: 0o755 });
    }
  });
  afterAll(() => {
    // the link first, on its own (never followed), then the rest of the workspace
    rmSync(join(cwd, "node_modules", "@hardkas", "testing"), { force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  it("executes a basic script and injects hardkas harness", () => {
    const markerFile = resolve(tmpdir(), `hardkas-test-marker-${Date.now()}.txt`);
    const testScript = resolve(tmpdir(), `hardkas-test-script-${Date.now()}.ts`);

    const scriptContent = `
      const h = (globalThis as any).hardkas;
      if (h && typeof h.send === 'function') {
        import('node:fs').then(fs => {
          fs.writeFileSync("${markerFile.replace(/\\/g, "/")}", "success");
        });
      }
    `;

    writeFileSync(testScript, scriptContent);

    try {
      // Execute CLI run command via tsx
      execSync(`${actualTsx} ${cliPath} run ${testScript} --network simulated`, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, NODE_OPTIONS: "--no-warnings" }
      });

      expect(existsSync(markerFile)).toBe(true);
    } finally {
      if (existsSync(testScript)) unlinkSync(testScript);
      if (existsSync(markerFile)) unlinkSync(markerFile);
    }
  });

  it("fails gracefully for missing script", () => {
    try {
      execSync(`${actualTsx} ${cliPath} run non-existent-script.ts`, {
        cwd,
        stdio: "pipe"
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(1);
      expect(((err as any).stderr).toString()).toContain("Script not found");
    }
  });

  it("respects --no-harness and does NOT inject global", () => {
    const markerFile = resolve(tmpdir(), `hardkas-test-noharness-${Date.now()}.txt`);
    const testScript = resolve(
      tmpdir(),
      `hardkas-test-script-noharness-${Date.now()}.ts`
    );

    const scriptContent = `
      const h = (globalThis as any).hardkas;
      if (h === undefined) {
        import('node:fs').then(fs => {
          fs.writeFileSync("${markerFile.replace(/\\/g, "/")}", "no-harness-success");
        });
      }
    `;

    writeFileSync(testScript, scriptContent);

    try {
      execSync(`${actualTsx} ${cliPath} run ${testScript} --no-harness`, {
        cwd,
        stdio: "inherit"
      });

      expect(existsSync(markerFile)).toBe(true);
    } finally {
      if (existsSync(testScript)) unlinkSync(testScript);
      if (existsSync(markerFile)) unlinkSync(markerFile);
    }
  });
});
