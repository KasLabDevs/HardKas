import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

describe("corpus verify", () => {
  it("verifies the SilverScript golden corpus per capability", () => {
    const distCli = path.resolve(__dirname, "../dist/index.js");
    if (!fs.existsSync(distCli)) {
      return;
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
