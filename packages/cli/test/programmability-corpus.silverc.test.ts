import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// silverc level (AUD-41): verifying the programmability corpus recompiles its
// SilverScript cases with the pinned silverc installed in HARDKAS_HOME. The
// other programmability CLI cases stay in programmability.test.ts.

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
