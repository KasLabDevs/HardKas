import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function runCompare(mode?: string) {
  const distCli = path.resolve(__dirname, "../dist/index.js");
  if (!fs.existsSync(distCli)) {
    return "";
  }

  const root = path.resolve(__dirname, "../../..");
  const fixtureDir = path.join(root, "fixtures", "toccata-v2", "silver", "op-true");
  const args = [
    distCli,
    "silver",
    "simulate",
    "compare",
    "--simulated",
    "spend-simulated.json",
    "--docker",
    "spend-receipt-real.json"
  ];
  if (mode) args.push("--mode", mode);

  return execFileSync(process.execPath, args, {
    cwd: fixtureDir,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 60_000
  }).replace(ANSI_RE, "");
}

describe("silver simulate compare lineage normalization", () => {
  it("treats lineage as semantically derived in artifact-coherence mode", () => {
    const output = runCompare("artifact-coherence");

    expect(output).toContain("SILVERSCRIPT_SIMULATION_MATCH");
    expect(output).toContain("lineage.source.spendPlanHash");
    expect(output).toContain("raw lineage IDs are domain-specific");
    expect(output).toContain("PARTIAL_VM_SIMULATION");
  });

  it("keeps strict mode available for raw receipt drift", () => {
    const output = runCompare("strict");

    expect(output).toContain("SILVERSCRIPT_SIMULATION_DRIFT");
    expect(output).toContain("lineage: semantic mismatch");
    expect(output).toContain("PARTIAL_VM_SIMULATION");
  });
});
