// SAFETY_LEVEL: SIMULATION_ONLY
// Postpublish Regression Test Suite
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLI_SRC = path.resolve(__dirname, "../src/index.ts");
const TSX = path.resolve(__dirname, "../../../node_modules/.bin/tsx");
const SANDBOX_DIR = path.resolve(__dirname, "../.tmp/postpublish-regression");

describe("Postpublish CLI Surface Regression", () => {
  before(() => {
    if (fs.existsSync(SANDBOX_DIR)) {
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  });

  it("should initialize a new workspace successfully", async () => {
    const { exitCode, stdout, stderr } = await execa(TSX, [CLI_SRC, "init", "test-proj"], {
      cwd: SANDBOX_DIR,
      reject: false
    });
    
    assert.strictEqual(exitCode, 0, `Init failed: ${stdout} ${stderr}`);
    assert.ok(fs.existsSync(path.join(SANDBOX_DIR, "test-proj", "package.json")), "package.json should exist");
  });

  it("should boot the runtime environment unconditionally", async () => {
    const projDir = path.join(SANDBOX_DIR, "test-proj");
    
    // We install dependencies just like a user would.
    await execa("npm", ["install"], { cwd: projDir, reject: false });
    
    const { exitCode, stdout, stderr } = await execa(TSX, [CLI_SRC, "up"], {
      cwd: projDir,
      reject: false
    });
    
    assert.strictEqual(exitCode, 0, `Up failed: ${stdout} ${stderr}`);
    assert.ok(stdout.includes("HardKAS Runtime Started"), "Runtime should start");
  });

  it("should generate a valid tx plan without strict mode crashing", async () => {
    const projDir = path.join(SANDBOX_DIR, "test-proj");
    const { exitCode, stdout, stderr } = await execa(TSX, [CLI_SRC, "tx", "plan", "--from", "alice", "--to", "bob", "--amount", "10"], {
      cwd: projDir,
      reject: false
    });
    
    assert.strictEqual(exitCode, 0, `Tx plan failed: ${stdout} ${stderr}`);
    assert.ok(stdout.includes("HardKAS Transaction Plan Artifact"), "Should output plan artifact");
  });
});
