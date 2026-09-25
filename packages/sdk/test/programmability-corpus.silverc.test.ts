import { describe, expect, it } from "vitest";
import fs from "node:fs";
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

describe("0.12.0-rc.23 programmability SDK surface (silverc installed)", () => {
  it("verifies the root programmability corpus", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
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
