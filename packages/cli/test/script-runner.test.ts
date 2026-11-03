import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  validateRunScriptOptions,
  resolveTsxCli,
  buildRunInjection,
  runScript
} from "../src/runners/script-runner.js";

describe("script-runner hardening", () => {
  describe("validateRunScriptOptions", () => {
    it("accepts valid accounts and balance parameters", () => {
      const res = validateRunScriptOptions({
        accounts: "3",
        balance: "100000000000",
        harness: true
      });
      expect(res.accounts).toBe(3);
      expect(res.balance).toBe(100000000000n);
    });

    it("rejects non-positive and non-integer accounts", () => {
      expect(() =>
        validateRunScriptOptions({ accounts: "0", balance: "1000", harness: true })
      ).toThrowError(/INVALID_ACCOUNTS/);

      expect(() =>
        validateRunScriptOptions({ accounts: "-5", balance: "1000", harness: true })
      ).toThrowError(/INVALID_ACCOUNTS/);

      expect(() =>
        validateRunScriptOptions({ accounts: "1.5", balance: "1000", harness: true })
      ).toThrowError(/INVALID_ACCOUNTS/);

      expect(() =>
        validateRunScriptOptions({ accounts: "3; drop table", balance: "1000", harness: true })
      ).toThrowError(/INVALID_ACCOUNTS/);
    });

    it("rejects invalid balance inputs", () => {
      expect(() =>
        validateRunScriptOptions({ accounts: "1", balance: "-100", harness: true })
      ).toThrowError(/INVALID_BALANCE/);

      expect(() =>
        validateRunScriptOptions({ accounts: "1", balance: "100n", harness: true })
      ).toThrowError(/INVALID_BALANCE/);

      expect(() =>
        validateRunScriptOptions({ accounts: "1", balance: "12.34", harness: true })
      ).toThrowError(/INVALID_BALANCE/);

      expect(() =>
        validateRunScriptOptions({ accounts: "1", balance: "1000; evil()", harness: true })
      ).toThrowError(/INVALID_BALANCE/);
    });
  });

  describe("resolveTsxCli", () => {
    it("resolves the tsx CLI executable from dependencies without relying on global path", () => {
      const tsxPath = resolveTsxCli();
      expect(typeof tsxPath).toBe("string");
      expect(fs.existsSync(tsxPath)).toBe(true);
      expect(tsxPath).toMatch(/cli\.mjs$/);
    });
  });

  describe("buildRunInjection", () => {
    it("generates sanitized code for simulated network", () => {
      const config = {
        networks: {
          simnet: { kind: "simulated" }
        }
      };
      const code = buildRunInjection(config, {
        network: "simnet",
        accounts: "5",
        balance: "5000000000",
        harness: true
      });
      expect(code).toContain("accounts: 5,");
      expect(code).toContain("initialBalance: 5000000000n,");
      expect(code).toContain('networkId: "simnet"');
    });

    it("returns empty string when harness is false", () => {
      const code = buildRunInjection({}, {
        network: "simnet",
        accounts: "1",
        balance: "1000",
        harness: false
      });
      expect(code).toBe("");
    });
  });

  describe("runScript execution safety", () => {
    let tmpDir: string;

    beforeEach(() => {
      // Create a directory path containing spaces and special characters
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas test spaces & #special!"));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it("throws SCRIPT_NOT_FOUND when script does not exist", async () => {
      await expect(
        runScript(path.join(tmpDir, "nonexistent.ts"), {
          accounts: "1",
          balance: "1000",
          harness: false,
          workspaceRoot: tmpDir
        })
      ).rejects.toThrow(/Script not found/);
    });

    it("throws INVALID_ARGUMENT when parameters are invalid", async () => {
      const dummyScript = path.join(tmpDir, "dummy.ts");
      fs.writeFileSync(dummyScript, "console.log('hi');");

      await expect(
        runScript(dummyScript, {
          accounts: "invalid",
          balance: "1000",
          harness: false,
          workspaceRoot: tmpDir
        })
      ).rejects.toThrow(/INVALID_ACCOUNTS/);
    });

    it("executes successfully when script path contains spaces and special characters", async () => {
      const testScript = path.join(tmpDir, "script with spaces & #special.ts");
      const sentinelFile = path.join(tmpDir, "output.sentinel");

      fs.writeFileSync(
        testScript,
        `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(sentinelFile)}, "ok");\n`
      );

      // Create a minimal config so resolveRunNetwork works
      const hardkasConfigFile = path.join(tmpDir, "hardkas.config.ts");
      fs.writeFileSync(
        hardkasConfigFile,
        `export default { defaultNetwork: "simnet", networks: { simnet: { kind: "simulated" } } };`
      );

      await runScript(testScript, {
        network: "simnet",
        accounts: "1",
        balance: "1000",
        harness: false,
        workspaceRoot: tmpDir
      });

      expect(fs.existsSync(sentinelFile)).toBe(true);
      expect(fs.readFileSync(sentinelFile, "utf8")).toBe("ok");
    });
  });
});
