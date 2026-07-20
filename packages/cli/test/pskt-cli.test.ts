import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

describe("hardkas pskt CLI flow", () => {
  const cliPath = resolve(__dirname, "../src/index.ts");
  const tsxBin = resolve(__dirname, "../../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";
  const tempDir = resolve(__dirname, `temp_pskt_${randomBytes(4).toString("hex")}`);

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });
    // Write a dummy TxPlan
    writeFileSync(resolve(tempDir, "plan.json"), JSON.stringify({
      kind: "hardkas-tx-plan",
      version: 1,
      planId: "test-plan",
      networkId: "simnet",
      inputs: [],
      outputs: []
    }));
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function runHardkas(args: string, env: any = {}) {
    try {
      const result = execSync(`${actualTsx} ${cliPath} pskt ${args}`, {
        env: { ...process.env, NODE_OPTIONS: "--no-warnings", NODE_ENV: "test", HARDKAS_EXPERIMENTAL: "1", ...env },
        encoding: "utf-8",
        cwd: tempDir
      });
      return { ok: true, stdout: result };
    } catch (err: any) {
      const stdout = ((err as any).stdout)?.toString();
      const stderr = ((err as any).stderr)?.toString();
      console.error(`runHardkas failed for args: ${args}`);
      console.error(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
      return {
        ok: false,
        stdout,
        stderr
      };
    }
  }

  describe("Capabilities and Gating", () => {
    it("reports unsupported capabilities for kaspa-wasm-local", () => {
      const result = runHardkas("capabilities --adapter kaspa-wasm-local --json");
      expect(result.ok).toBe(true);
      const caps = JSON.parse(result.stdout);
      expect(caps.operations.export).toBe(false);
      expect(caps.operations.sign).toBe(false);
    });

    it("fails with PSKT_OPERATION_UNSUPPORTED when using default adapter", () => {
      const result = runHardkas("export --plan plan.json --out sess.json --adapter kaspa-wasm-local --json");
      expect(result.ok).toBe(false);
      expect(result.stdout).toContain("PSKT_OPERATION_UNSUPPORTED");
    });

    it("reports supported capabilities for test-fake-adapter", () => {
      const result = runHardkas("capabilities --adapter test-fake-adapter --json");
      expect(result.ok).toBe(true);
      const caps = JSON.parse(result.stdout);
      expect(caps.operations.export).toBe(true);
      expect(caps.operations.sign).toBe(true);
    });
  });

  describe("End-to-End Fake Flow", () => {
    it("exports a session", () => {
      const res = runHardkas("export --plan plan.json --adapter test-fake-adapter --out session-0.json --json");
      expect(res.ok).toBe(true);
      expect(existsSync(resolve(tempDir, "session-0.json"))).toBe(true);
    });

    it("inspects the exported session", () => {
      const res = runHardkas("inspect session-0.json --json");
      expect(res.ok).toBe(true);
      const meta = JSON.parse(res.stdout);
      expect(meta.planId).toBe("test-plan");
      expect(meta.revision).toBe(0);
      expect(meta.runtimeBinding.adapterId).toBe("test-fake-adapter");
    });

    it("verifies the exported session", () => {
      const res = runHardkas("verify session-0.json --json");
      expect(res.ok).toBe(true);
      const verify = JSON.parse(res.stdout);
      expect(verify.valid).toBe(true);
      expect(verify.integrity).toBe("PASS");
    });

    it("signs the session", () => {
      writeFileSync(resolve(tempDir, "key.txt"), "fake-key");
      const res = runHardkas("sign session-0.json --private-key-file key.txt --out session-1.json --json");
      expect(res.ok).toBe(true);
      
      const inspect = runHardkas("inspect session-1.json --json");
      const meta = JSON.parse(inspect.stdout);
      expect(meta.revision).toBe(1);
    });

    it("creates a conflicting signature session-2", () => {
      writeFileSync(resolve(tempDir, "key2.txt"), "fake-key-2");
      const res = runHardkas("sign session-0.json --private-key-file key2.txt --out session-2.json --json");
      expect(res.ok).toBe(true);
    });

    it("merges session-1 and session-2", () => {
      const res = runHardkas("merge session-1.json session-2.json --out session-merged.json --json");
      expect(res.ok).toBe(true);

      const inspect = runHardkas("inspect session-merged.json --json");
      const meta = JSON.parse(inspect.stdout);
      expect(meta.revision).toBe(2);
    });

    it("finalizes the merged session", () => {
      const res = runHardkas("finalize session-merged.json --out session-finalized.json --json");
      expect(res.ok).toBe(true);
    });

    it("extracts the Kaspa transaction", () => {
      const res = runHardkas("extract session-finalized.json --out tx.json --json");
      expect(res.ok).toBe(true);
      expect(existsSync(resolve(tempDir, "tx.json"))).toBe(true);
      const tx = require(resolve(tempDir, "tx.json"));
      expect(tx.kind).toBe("hardkas-transaction");
      expect(tx.txId).toBe("fake-tx-id");
    });

    it("refuses to overwrite without --force", () => {
      const res = runHardkas("extract session-finalized.json --out tx.json --json");
      expect(res.ok).toBe(false);
      expect(res.stdout).toContain("already exists");
      expect(res.stdout).toContain("Use --force to overwrite");
    });

    it("overwrites with --force", () => {
      const res = runHardkas("extract session-finalized.json --out tx.json --force --json");
      expect(res.ok).toBe(true);
    });
  });
});
