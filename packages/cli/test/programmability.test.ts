import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist } from "./first-contact-helpers.js";

// REMED-CLOSE · test isolation: `programmability` sets up the workspace of the directory it runs in (.hardkas); the
// built CLI runs in a temporary directory of its own, never the repository root
let workspaceRoot = "";
beforeAll(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cli-programmability-"));
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

describe("programmability CLI", () => {
  it("prints programmability capabilities", () => {
    const result = runHardkas(["programmability", "capabilities", "--json"]);
    expect(result.status).toBe(0);
    const json = parseStdout(result);
    expect(json.status).toBe("PROGRAMMABILITY_SURFACE_READY");
    expect(json.claims.mainnet).toBe("BLOCKED_BY_POLICY");
  });

  // "verifies the root programmability corpus" recompiles with the pinned silverc:
  // see programmability-corpus.silverc.test.ts (silverc level).

  it("plans an app", () => {
    const result = runHardkas([
      "programmability",
      "app",
      "plan",
      "--kind",
      "full-lab",
      "--json"
    ]);
    expect(result.status).toBe(0);
    const json = parseStdout(result);
    expect(json.status).toBe("PROGRAMMABILITY_APP_PLAN_READY");
    expect(json.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
  });
});
