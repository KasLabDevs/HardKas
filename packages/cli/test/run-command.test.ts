import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

describe("hardkas run", () => {
  const cliPath = resolve("src/index.ts");
  const tsxBin = resolve("../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";

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
      execSync(`${actualTsx} ${cliPath} run ${testScript}`, {
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
        stdio: "pipe"
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(1);
      expect(err.stderr.toString()).toContain("Script not found");
    }
  });

  it("respects --no-harness and does NOT inject global", () => {
    const markerFile = resolve(tmpdir(), `hardkas-test-noharness-${Date.now()}.txt`);
    const testScript = resolve(tmpdir(), `hardkas-test-script-noharness-${Date.now()}.ts`);
    
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
        stdio: "inherit"
      });

      expect(existsSync(markerFile)).toBe(true);
    } finally {
      if (existsSync(testScript)) unlinkSync(testScript);
      if (existsSync(markerFile)) unlinkSync(markerFile);
    }
  });
});
