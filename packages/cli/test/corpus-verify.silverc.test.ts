import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// silverc level (AUD-41): the built CLI recompiles the golden corpus with the
// pinned silverc installed in HARDKAS_HOME. Preconditions are the built CLI
// (`pnpm --filter @hardkas/cli build`) and the compiler; a missing precondition
// is a failure, never a silent pass.
describe("corpus verify", () => {
  it("verifies the SilverScript golden corpus per capability", () => {
    const distCli = path.resolve(__dirname, "../dist/index.js");
    if (!fs.existsSync(distCli)) {
      throw new Error(`built CLI not found at ${distCli}: run \`pnpm --filter @hardkas/cli build\` before the silverc level`);
    }

    const root = path.resolve(__dirname, "../../..");
    const output = execFileSync(
      process.execPath,
      [distCli, "corpus", "verify", "fixtures/toccata-v2/silver", "--json"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 60_000
      }
    );
    const result = JSON.parse(output);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.schema).toBe("hardkas.silverCorpusVerify.v1");
    expect(result.summary).toMatchObject({ cases: 4, compilesRecompiled: 5, compiler: "silverc v1.0.0" });
    expect(result.capabilities).toEqual({
      "silver.compile.v1": "PASS",
      "silver.p2sh.deploy-spend.v1": "PASS",
      "silver.p2sh.relative-timelock.v1": "PASS",
      "toccata.covenant.auth-1to1-transition.v1": "PASS"
    });
  });
});
