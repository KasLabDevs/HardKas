import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";

describe("Deployment tracking", () => {
  const cliPath = resolve("src/index.ts");
  const tsxBin = resolve("../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";
  const testDir = resolve(`.tmp/test-deployments-${process.pid}`);

  function runHardkas(args: string) {
    try {
      const stdout = execSync(`${actualTsx} ${cliPath} ${args}`, {
        env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
        cwd: testDir,
        encoding: "utf-8"
      });
      return { ok: true, stdout };
    } catch (err: any) {
      return { ok: false, stdout: err.stdout?.toString(), stderr: err.stderr?.toString() };
    }
  }

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("tracks a deployment with label and network", () => {
    const result = runHardkas('deploy track my-deploy --network simnet --tx-id simtx_abc --status sent');
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Tracked deployment: my-deploy (simnet)");
  });

  it("lists tracked deployments", () => {
    runHardkas('deploy track deploy-1 --network simnet --tx-id simtx_1 --status sent');
    runHardkas('deploy track deploy-2 --network simnet --tx-id simtx_2 --status confirmed');
    const result = runHardkas('deploy list --json');
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.length).toBe(2);
  });

  it("inspects a specific deployment", () => {
    runHardkas('deploy track vault-v1 --network testnet-11 --tx-id tx_abc --notes "first deploy"');
    const result = runHardkas('deploy inspect vault-v1 --network testnet-11 --json');
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.label).toBe("vault-v1");
    expect(parsed.notes).toBe("first deploy");
  });

  it("deployment has valid content hash", () => {
    runHardkas('deploy track test-deploy --network simnet --tx-id simtx_x');
    const result = runHardkas('deploy inspect test-deploy --network simnet --json');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses duplicate label on same network", () => {
    runHardkas('deploy track dup --network simnet --tx-id simtx_1');
    const result = runHardkas('deploy track dup --network simnet --tx-id simtx_2');
    expect(result.ok).toBe(false);
    expect(result.stderr || result.stdout).toContain("already exists");
  });

  it("same label allowed on different networks", () => {
    runHardkas('deploy track multi --network simnet --tx-id simtx_1');
    const result = runHardkas('deploy track multi --network testnet-11 --tx-id tx_2');
    expect(result.ok).toBe(true);
  });
});
