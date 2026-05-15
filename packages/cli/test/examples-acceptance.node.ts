// SAFETY_LEVEL: SIMULATION_ONLY
//
// HardKAS CLI Examples Acceptance Suite v0
// Proves that every documented command and example works end-to-end.

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateContentHash } from "@hardkas/artifacts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLI_SRC = path.resolve(__dirname, "../src/index.ts");
const TSX = path.resolve(__dirname, "../../../node_modules/.bin/tsx");
const SANDBOX_DIR = path.resolve(__dirname, "../.tmp/examples-suite");

const TEST_PASS = "gauntlet-pass-123";
const ARTIFACT_VERSION = "1.0.0-alpha";
const HARDKAS_VERSION = "0.2.2-alpha.1";

// Verification Metrics
let commandsRun = 0;
let successfulCommands = 0;
let expectedFailures = 0;
let sdkMissing = false;
const commandResults: any[] = [];

interface RunExampleOptions {
  name: string;
  command: string;
  cwd?: string;
  expectExitCode?: number;
  outputIncludes?: string[];
  outputExcludes?: string[];
  input?: string;
  env?: Record<string, string>;
}

async function runCliExample(options: RunExampleOptions) {
  commandsRun++;
  const testCwd = options.cwd || SANDBOX_DIR;
  
  if (!fs.existsSync(testCwd)) {
    fs.mkdirSync(testCwd, { recursive: true });
  }

  const args = options.command.split(" ");
  
  try {
    const proc = execa(TSX, [CLI_SRC, ...args], {
      cwd: testCwd,
      reject: false,
      env: {
        ...process.env,
        HARDKAS_COLOR: "0",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        PAGER: "cat",
        HARDKAS_TEST_PASS: TEST_PASS,
        ...options.env
      }
    });

    if (options.input) {
      proc.stdin?.write(options.input);
      proc.stdin?.end();
    }

    const { stdout, stderr, exitCode } = await proc;
    const output = stdout + stderr;

    // Heuristic for SDK presence
    if (output.includes("Kaspa SDK key generation dependency is not installed")) {
      sdkMissing = true;
    }

    const expectedCode = options.expectExitCode ?? 0;
    
    if (exitCode === expectedCode) {
      if (expectedCode !== 0) expectedFailures++;
      else successfulCommands++;
    }

    // Capture result for summary hash
    commandResults.push({
      name: options.name,
      cmd: options.command,
      code: exitCode,
      outHash: calculateContentHash(output)
    });

    // Assertions
    assert.strictEqual(exitCode, expectedCode, `Command "${options.command}" failed with code ${exitCode}, expected ${expectedCode}\nOutput: ${output}`);

    if (options.outputIncludes) {
      for (const inc of options.outputIncludes) {
        assert.ok(output.includes(inc), `Output should include "${inc}"\nActual: ${output}`);
      }
    }

    if (options.outputExcludes) {
      for (const exc of options.outputExcludes) {
        assert.ok(!output.includes(exc), `Output should NOT include "${exc}"\nActual: ${output}`);
      }
    }

    return { stdout, stderr, exitCode, output };
  } catch (err: any) {
    console.error(`Execution error for ${options.name}:`, err);
    throw err;
  }
}

describe("HardKAS CLI Examples Acceptance Suite", () => {
  const suiteStart = Date.now();

  before(() => {
    if (fs.existsSync(SANDBOX_DIR)) {
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  });

  describe("Bootstrap Workflow", () => {
    it("should show help", async () => {
      await runCliExample({
        name: "help",
        command: "--help",
        outputIncludes: ["Usage: hardkas"]
      });
    });

    it("should initialize a new project", async () => {
      await runCliExample({
        name: "init",
        command: "init . --force",
        outputIncludes: ["initialized successfully"]
      });
    });

    it("should run doctor", async () => {
      await runCliExample({
        name: "doctor",
        command: "doctor",
        outputIncludes: ["Doctor", "Operation", "Store"]
      });
    });
  });

  describe("Account Workflow", () => {
    it("should handle account generation (reporting SDK status)", async () => {
      // First attempt to detect SDK state without hanging on prompt
      await runCliExample({
        name: "acc-detect",
        command: "accounts real generate --name detect --network simnet --password-env HARDKAS_TEST_PASS",
        expectExitCode: sdkMissing ? 1 : 0
      }).catch(() => null);

      const effectiveExpectedCode = sdkMissing ? 1 : 0;

      await runCliExample({
        name: "acc-gen",
        command: "accounts real generate --name test-acc --count 1 --network simnet --password-env HARDKAS_TEST_PASS",
        expectExitCode: effectiveExpectedCode,
        outputIncludes: sdkMissing ? ["Kaspa SDK"] : ["Created"]
      });
    });

    it("should list default accounts", async () => {
      await runCliExample({
        name: "acc-list",
        command: "accounts list",
        outputIncludes: ["alice", "simulated"]
      });
    });
  });

  describe("L1 Transaction Workflow", () => {
    it("should fund an account on simnet", async () => {
      await runCliExample({
        name: "faucet",
        command: "accounts fund alice --amount 5000",
        outputIncludes: ["Successfully funded"]
      });
    });

    it("should perform plan -> sign cycle", async () => {
      const artDir = path.join(SANDBOX_DIR, ".hardkas", "artifacts");
      if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });

      // 1. Plan
      const planRelativePath = ".hardkas/artifacts/plan.json";
      await runCliExample({
        name: "tx-plan",
        command: `tx plan --from alice --to bob --amount 100 --network simnet --out ${planRelativePath}`,
        outputIncludes: ["HardKAS Transaction Plan Artifact"]
      });

      // 2. Sign
      const signedRelativePath = ".hardkas/artifacts/signed.json";
      await runCliExample({
        name: "tx-sign",
        command: `tx sign ${planRelativePath} --out ${signedRelativePath}`,
        outputIncludes: ["HardKAS Signed Transaction Artifact"]
      });
    });
  });

  describe("Query Workflow", () => {
    it("should rebuild index and query artifacts", async () => {
      await runCliExample({
        name: "query-rebuild",
        command: "query store rebuild",
        outputIncludes: ["Index rebuilt successfully"]
      });

      await runCliExample({
        name: "query-list",
        command: "query artifacts list",
        outputIncludes: ["hardkas.txPlan"]
      });
    });
  });

  describe("Script Runner Workflow", () => {
    it("should run a simple script", async () => {
      const scriptPath = path.join(SANDBOX_DIR, "simple-test.ts");
      fs.writeFileSync(scriptPath, `
        import { UI } from "@hardkas/sdk";
        console.log("HELLO FROM SCRIPT");
      `);

      await runCliExample({
        name: "run-script",
        command: "run simple-test.ts",
        outputIncludes: ["HELLO FROM SCRIPT"]
      });
    });
  });

  describe("Safety Matrix", () => {
    it("should refuse mainnet signing without flag", async () => {
      const mainnetPlan: any = {
        schema: "hardkas.txPlan",
        version: ARTIFACT_VERSION,
        hardkasVersion: HARDKAS_VERSION,
        networkId: "mainnet",
        mode: "real",
        createdAt: new Date().toISOString(),
        planId: "test-plan-mainnet",
        from: { address: "kaspa:abc" },
        to: { address: "kaspa:def" },
        amountSompi: "1000",
        estimatedFeeSompi: "10",
        estimatedMass: "100",
        inputs: [],
        outputs: []
      };
      
      mainnetPlan.contentHash = calculateContentHash(mainnetPlan);
      const planPath = path.join(SANDBOX_DIR, "mainnet-plan.json");
      fs.writeFileSync(planPath, JSON.stringify(mainnetPlan));

      await runCliExample({
        name: "mainnet-sign-guard",
        command: "tx sign mainnet-plan.json",
        expectExitCode: 1,
        outputIncludes: ["mainnet"]
      });
    });

    it("should refuse faucet on mainnet", async () => {
      const configPath = path.join(SANDBOX_DIR, "hardkas.config.ts");
      fs.writeFileSync(configPath, `
        export default {
          defaultNetwork: "mainnet"
        };
      `);

      await runCliExample({
        name: "mainnet-faucet-guard",
        command: "accounts fund alice",
        expectExitCode: 1,
        outputIncludes: ["development networks"]
      });

      fs.rmSync(configPath);
    });
  });

  after(async () => {
    const artifactsDir = path.join(SANDBOX_DIR, ".hardkas", "artifacts");
    const artifactCount = fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir).length : 0;

    const summary = {
      examplesVersion: "cli-examples-v0",
      commandsRun,
      successfulCommands,
      expectedFailures,
      artifactCount,
      sdkPresent: !sdkMissing,
      summaryHash: ""
    };
    
    const hashBasis = {
      v: summary.examplesVersion,
      results: commandResults,
      arts: artifactCount
    };
    summary.summaryHash = calculateContentHash(hashBasis);
    
    const goldenDir = path.resolve(__dirname, "../test/golden");
    if (!fs.existsSync(goldenDir)) fs.mkdirSync(goldenDir, { recursive: true });
    
    const goldenPath = path.join(goldenDir, "examples-summary.json");
    fs.writeFileSync(goldenPath, JSON.stringify(summary, null, 2));
    
    const suiteDuration = Date.now() - suiteStart;
    console.log(`\n  [DX ACCEPTANCE] Suite Finished.`);
    console.log(`  Summary: ${successfulCommands}/${commandsRun} passed, ${expectedFailures} expected failures.`);
    console.log(`  Artifacts: ${artifactCount}`);
    console.log(`  SDK Present: ${!sdkMissing}`);
    console.log(`  Duration: ${suiteDuration}ms`);
    console.log(`  Golden sealed: ${goldenPath}\n`);
  });
});
