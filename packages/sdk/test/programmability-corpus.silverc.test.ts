import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hardkas, HardkasProgrammability } from "../src/index.js";

// silverc level (AUD-41): verifying the programmability corpus recompiles its
// SilverScript cases with the pinned silverc installed in HARDKAS_HOME. The
// other programmability SDK cases stay in programmability-0-9-1.test.ts.

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

/**
 * REMED-CLOSE · test isolation: an SDK opened with autoBootstrap writes its workspace state (.hardkas). The corpus is
 * verified in a temporary workspace of its own holding a copy of it at the same relative path, never the repository root.
 */
function corpusWorkspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-corpus-ws-"));
  fs.cpSync(path.join(repoRoot(), "fixtures", "toccata-v2"), path.join(ws, "fixtures", "toccata-v2"), { recursive: true });
  return ws;
}

describe("0.13.0-rc.1 programmability SDK surface (silverc installed)", () => {
  let workspaceRoot = "";

  beforeEach(() => {
    workspaceRoot = corpusWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("verifies the root programmability corpus", async () => {
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const prog = new HardkasProgrammability(sdk);
    const result = await prog.corpus.verify({
      path: "fixtures/toccata-v2"
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PROGRAMMABILITY_CORPUS_PASS");
    expect(result.summary.silver).toBe("PASS");
    expect(result.summary.zk).toBe("PASS");
    expect(result.summary.vprogs).toBe("PASS");
    expect(result.claims.runtimeOutcome).toBe("PARTIAL");
  });
});
