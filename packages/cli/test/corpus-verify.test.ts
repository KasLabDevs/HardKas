import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

describe("corpus verify", () => {
  it("verifies the Toccata v2 Silver golden corpus as a bounded release claim", () => {
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
    let result: any;
    try {
        result = JSON.parse(output);
    } catch(e) {
        throw new Error("OUTPUT WAS: " + JSON.stringify(output) + "\nSTDERR MIGHT BE IN exec error, but it exited 0?");
    }
    expect(result.ok).toBe(true);
    expect(result.schema).toBe("hardkas.toccataCorpus.v1");
    expect(result.summary).toMatchObject({
      happyPathFixtures: 1,
      failureFixtures: 6,
      artifactsChecked: 7,
      contentHashes: "PASS",
      compareMode: "artifact-coherence",
      simulationStatus: "SILVERSCRIPT_SIMULATION_MATCH"
    });
    expect(result.summary.knownLimitations).toContain("PARTIAL_VM_SIMULATION");
    expect(result.claims).toMatchObject({
      artifactCoherence: "READY_MATCH",
      runtimeOutcome: "PARTIAL",
      vmConsensusEquivalence: "NOT_CLAIMED",
      mainnet: "BLOCKED_BY_POLICY"
    });
    expect(result.issues).toEqual([]);
  });
});
