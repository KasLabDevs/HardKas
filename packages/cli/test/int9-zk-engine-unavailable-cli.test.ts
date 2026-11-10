import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// INT9 · D3: snarkjs is an OPTIONAL peer of @hardkas/sdk. Without it the SDK reports the issue ZK_ENGINE_UNAVAILABLE
// (status ZK_GROTH16_VERIFIER_ERROR / ZK_R0_GROTH16_VERIFIER_ERROR, never VERIFIED). The CLI's own code for that
// failure was the generic one of each command (ZK_GROTH16_MATH_FAILED, ZK_R0_RECEIPT_VERIFY_FAILED,
// ZK_CORPUS_VERIFY_FAILED): it is now ZK_ENGINE_UNAVAILABLE, the SDK's, with the same exit code (1). A proof the checks
// that need no engine reject keeps the command's own code. ZK is frozen: codes and texts only.
// The repo has snarkjs installed (devDependency), so the built CLI runs with a preload that makes `snarkjs` unresolvable
// exactly the way Node fails for a package that is not installed; everything else resolves as usual.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = path.join(ROOT, "packages", "cli", "dist", "index.js");
const ZK = path.join(ROOT, "fixtures", "toccata-v2", "zk");
const MULTIPLIER = path.join(ZK, "groth16-multiplier");
const R0 = path.join(ZK, "r0-groth16-official");

let dir: string;
let preload: string;

beforeAll(() => {
  if (!existsSync(CLI)) throw new Error("packages/cli/dist is missing: build the CLI first");
  dir = mkdtempSync(path.join(os.tmpdir(), "hardkas-int9-zk-"));
  preload = path.join(dir, "hide-snarkjs.cjs");
  writeFileSync(
    preload,
    [
      "const Module = require('node:module');",
      "const original = Module._resolveFilename;",
      "Module._resolveFilename = function (request, ...rest) {",
      "  if (request === 'snarkjs' || request.startsWith('snarkjs/')) {",
      "    const e = new Error(\"Cannot find module '\" + request + \"'\\nRequire stack:\\n- (int9 test)\");",
      "    e.code = 'MODULE_NOT_FOUND';",
      "    throw e;",
      "  }",
      "  return original.call(this, request, ...rest);",
      "};"
    ].join("\n")
  );
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function hardkas(args: string[], hideSnarkjs: boolean) {
  const nodeOptions = [process.env.NODE_OPTIONS ?? "", "--no-warnings", hideSnarkjs ? `--require=${preload}` : ""].join(" ").trim();
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: "1", HARDKAS_TEST_IGNORE_STALENESS: "1", NODE_OPTIONS: nodeOptions }
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const receiptArgs = () => [
  "--image-id",
  JSON.parse(readFileSync(path.join(R0, "image-id.json"), "utf8")).imageId,
  "--journal-hash",
  JSON.parse(readFileSync(path.join(R0, "journal.json"), "utf8")).journalHash,
  "--receipt",
  path.join(R0, "receipt.hex")
];

describe("INT9 · zk commands without the optional peer snarkjs", () => {
  it("zk proof verify-math: ZK_ENGINE_UNAVAILABLE (exit 1), not the generic ZK_GROTH16_MATH_FAILED", { timeout: 180_000 }, () => {
    const human = hardkas(["zk", "proof", "verify-math", MULTIPLIER, "--allow-weak-vk"], true);
    expect(human.status, human.stdout + human.stderr).toBe(1);
    expect(human.stderr).toContain("[ZK_ENGINE_UNAVAILABLE]");
    expect(human.stderr).toMatch(/optional peer dependency snarkjs/);
    expect(human.stderr).not.toContain("ZK_GROTH16_MATH_FAILED");

    const json = hardkas(["zk", "proof", "verify-math", MULTIPLIER, "--allow-weak-vk", "--json"], true);
    expect(json.status).toBe(1);
    const doc = JSON.parse(json.stdout);
    expect(doc.status).toBe("ZK_GROTH16_VERIFIER_ERROR");
    expect(doc.verified).toBe(false);
    expect(doc.issues.map((i: { code: string }) => i.code)).toContain("ZK_ENGINE_UNAVAILABLE");
  });

  it("zk proof verify-math: a key the weak-key filter rejects keeps ZK_GROTH16_MATH_FAILED, engine or not", { timeout: 180_000 }, () => {
    for (const hide of [true, false]) {
      const r = hardkas(["zk", "proof", "verify-math", MULTIPLIER], hide);
      expect(r.status, `hide=${hide}`).toBe(1);
      expect(r.stderr, `hide=${hide}`).toContain("[ZK_GROTH16_MATH_FAILED]");
      expect(r.stderr).not.toContain("ZK_ENGINE_UNAVAILABLE");
    }
  });

  it("zk toccata verify-receipt: ZK_ENGINE_UNAVAILABLE, not ZK_R0_RECEIPT_VERIFY_FAILED", { timeout: 180_000 }, () => {
    const r = hardkas(["zk", "toccata", "verify-receipt", ...receiptArgs()], true);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain("[ZK_ENGINE_UNAVAILABLE]");
    expect(r.stderr).not.toContain("ZK_R0_RECEIPT_VERIFY_FAILED");
  });

  it("zk toccata verify-receipt with snarkjs: the official receipt verifies (control)", { timeout: 180_000 }, () => {
    const r = hardkas(["zk", "toccata", "verify-receipt", ...receiptArgs(), "--json"], false);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).status).toBe("ZK_R0_GROTH16_RECEIPT_VERIFIED");
  });

  it("zk corpus verify: ZK_ENGINE_UNAVAILABLE when a fixture's pairing could not run", { timeout: 180_000 }, () => {
    const r = hardkas(["zk", "corpus", "verify", ZK], true);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain("[ZK_ENGINE_UNAVAILABLE]");
    expect(r.stderr).not.toContain("ZK_CORPUS_VERIFY_FAILED");
  });

  it("zk corpus verify with snarkjs: PASS (control)", { timeout: 180_000 }, () => {
    const r = hardkas(["zk", "corpus", "verify", ZK, "--json"], false);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });
});
