import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist, repoRoot } from "./first-contact-helpers.js";

// silverc level (AUD-41): verifying the programmability corpus recompiles its
// SilverScript cases with the pinned silverc installed in HARDKAS_HOME. The
// other programmability CLI cases stay in programmability.test.ts.

// REMED-CLOSE · test isolation: `programmability` sets up the workspace of the directory it runs in (.hardkas); the
// built CLI runs in a temporary workspace of its own holding a copy of the corpus at the same relative path, never in
// the repository root
let workspaceRoot = "";
beforeAll(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cli-programmability-corpus-"));
  fs.cpSync(path.join(repoRoot, "fixtures", "toccata-v2"), path.join(workspaceRoot, "fixtures", "toccata-v2"), { recursive: true });
});
afterAll(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

function runHardkas(args: string[]) {
  return spawnSync(process.execPath, [cliDist, ...args], {
    cwd: workspaceRoot,
    env: process.env,
    encoding: "utf8"
  });
}

function parseStdout(result: ReturnType<typeof runHardkas>) {
  const envelope = JSON.parse(result.stdout);
  return envelope.result ?? envelope;
}

describe("programmability CLI (silverc installed)", () => {
  it("verifies the root programmability corpus", () => {
    const result = runHardkas([
      "programmability",
      "corpus",
      "verify",
      "fixtures/toccata-v2",
      "--json"
    ]);
    expect(result.status, result.stderr).toBe(0);
    const json = parseStdout(result);
    expect(json.status).toBe("PROGRAMMABILITY_CORPUS_PASS");
    expect(json.summary.silver).toBe("PASS");
    expect(json.summary.zk).toBe("PASS");
    expect(json.summary.vprogs).toBe("PASS");
  });
});
