import { describe, it, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import path from "node:path";
import fs from "node:fs";

describe("Simnet Transaction Backend Mismatch Regression", () => {
  const repoRoot = process.cwd().includes("packages") 
    ? path.resolve(process.cwd(), "../..") 
    : process.cwd();
  const TSX = path.resolve(repoRoot, "node_modules/.bin/tsx");
  const CLI_SRC = path.resolve(repoRoot, "packages/cli/src/index.ts");
  const SANDBOX_DIR = path.resolve(repoRoot, "packages/cli/.tmp/tx-simulated-test");

  beforeAll(() => {
    if (fs.existsSync(SANDBOX_DIR)) {
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(SANDBOX_DIR)) {
      try {
        fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
      } catch (e) {
        console.warn("Could not clean up sandbox directory:", e);
      }
    }
  });

  async function runCmd(args: string[]) {
    return execa(TSX, [CLI_SRC, ...args], {
      cwd: SANDBOX_DIR,
      reject: false,
      env: {
        ...process.env,
        HARDKAS_COLOR: "0",
        NO_COLOR: "1"
      }
    });
  }

  it("should fail when using a simulated account on a real network", async () => {
    const { exitCode, stdout, stderr } = await runCmd([
      "tx", "plan",
      "--from", "alice",
      "--to", "bob",
      "--amount", "10",
      "--network", "testnet-11"
    ]);

    const output = stdout + stderr;
    if (exitCode === 0) {
      throw new Error(`Expected command to fail, but it succeeded. Output:\n${output}`);
    }
    
    if (!output.includes("NETWORK_ACCOUNT_MISMATCH")) {
      throw new Error(`Expected output to contain 'NETWORK_ACCOUNT_MISMATCH'. Actual:\n${output}`);
    }
  }, 30000);

  it("should ignore RPC URL override on simnet and not touch RPC", async () => {
    // 0. Initialize workspace so default network is simulated
    fs.writeFileSync(path.join(SANDBOX_DIR, "hardkas.config.js"), `
      export default {
        defaultNetwork: "simulated"
      };
    `);

    // 1. Fund alice in the temporary workspace
    const fundResult = await runCmd(["accounts", "fund", "alice", "--amount", "1000"]);
    if (fundResult.exitCode !== 0) {
      throw new Error(`Failed to fund alice. Output:\n${fundResult.stdout + fundResult.stderr}`);
    }

    // 2. Plan a transaction using an invalid RPC URL on simnet
    // If the bug exists, this will hang or return "fetch failed" / "unreachable"
    const txPlanPath = "tx-plan.json";
    const { exitCode, stdout, stderr } = await runCmd([
      "tx", "plan",
      "--from", "alice",
      "--to", "bob",
      "--amount", "10",
      "--network", "simnet",
      "--url", "http://127.0.0.1:1",
      "--out", txPlanPath
    ]);

    const output = stdout + stderr;

    if (exitCode !== 0) {
      throw new Error(`Expected command to succeed, but it failed with code ${exitCode}. Output:\n${output}`);
    }

    if (output.includes("timeout") || output.includes("fetch failed") || output.includes("RPC unavailable")) {
      throw new Error(`Command attempted to call RPC. Output:\n${output}`);
    }

    // 3. Verify the artifact was created
    const artifactFullPath = path.join(SANDBOX_DIR, txPlanPath);
    if (!fs.existsSync(artifactFullPath)) {
      throw new Error(`Expected artifact ${txPlanPath} to exist.`);
    }

    const artifactContent = fs.readFileSync(artifactFullPath, "utf8");
    const parsed = JSON.parse(artifactContent);

    if (parsed.mode !== "simulated") {
      throw new Error(`Expected artifact mode to be 'simulated', got '${parsed.mode}'`);
    }
    if (parsed.networkId !== "simulated") {
      throw new Error(`Expected artifact networkId to be 'simulated', got '${parsed.networkId}'`);
    }
  }, 30000);
});
