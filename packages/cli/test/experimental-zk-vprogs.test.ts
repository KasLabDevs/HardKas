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

function runHardkas(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync("pnpm", ["exec", "tsx", "packages/cli/src/index.ts", ...args], {
    cwd: repoRoot(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function parseStdout(result: ReturnType<typeof runHardkas>) {
  return JSON.parse(result.stdout);
}

describe("ZK corpus and vProgs inspect CLI", () => {
  it("prints ZK capabilities as JSON", () => {
    const result = runHardkas(["zk", "capabilities", "--json"]);
    expect(result.status).toBe(0);
    const json = parseStdout(result);
    expect(json.schema).toBe("hardkas.zkCapabilities.v1");
    expect(json.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
  });

  it("verifies the ZK corpus", () => {
    const result = runHardkas(["zk", "corpus", "verify", "fixtures/toccata-v2/zk", "--json"]);
    expect(result.status).toBe(0);
    const json = parseStdout(result);
    expect(json.status).toBe("ZK_CORPUS_VERIFICATION_PASS");
    expect(json.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
  });

  it("shows vProgs inspect status by default", () => {
    const result = runHardkas(["vprogs", "status", "--json"]);
    expect(result.status).toBe(0);
    const json = parseStdout(result);
    expect(json.status).toBe("VPROGS_INSPECT_SURFACE_READY");
  });

  it("inspects vProgs artifacts without runtime claims", () => {
    const status = runHardkas(["vprogs", "status", "--json"]);
    expect(status.status).toBe(0);
    const statusJson = parseStdout(status);
    expect(statusJson.claims.vProgsRuntime).toBe("NOT_CLAIMED");
    expect(statusJson.claims.vProgsStableApi).toBe("NOT_CLAIMED");

    const inspect = runHardkas(
      ["vprogs", "inspect", "fixtures/toccata-v2/vprogs/inspect-only-artifact.json", "--json"]
    );
    expect(inspect.status).toBe(0);
    expect(parseStdout(inspect).status).toBe("VPROGS_ARTIFACT_INSPECTED");
  });
});
