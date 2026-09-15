import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function runHardkas(args: string[]) {
  return spawnSync("pnpm", ["exec", "tsx", "packages/cli/src/index.ts", ...args], {
    cwd: repoRoot(),
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32"
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

  it("verifies the root programmability corpus", () => {
    const result = runHardkas([
      "programmability",
      "corpus",
      "verify",
      "fixtures/toccata-v2",
      "--json"
    ]);
    expect(result.status).toBe(1);
    const json = parseStdout(result);
    expect(json.status).toBe("PROGRAMMABILITY_CORPUS_FAIL");
    expect(json.summary.silver).toBe("PASS");
    expect(json.summary.zk).toBe("PASS");
    expect(json.summary.vprogs).toBe("FAIL");
  });

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
