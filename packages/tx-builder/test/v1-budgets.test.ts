import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getSilContract, parseSilAbiArtifact, verifySilverTemplate } from "@hardkas/core";
import { checkComputeBudget, proposeComputeBudget, v1BudgetForUnits, v1ScriptUnitsAllowed, V1_CERTIFIED_COMPUTE_BUDGETS } from "../src/index.js";

// -----------------------------------------------------------------------------
// F1.8 · compute budgets: the allowance formula against the ten "script units exceeded" answers of the corpus genesis
// certification (budgets 0–9, used = 100,000), the smallest budget for a measured use, the certified proposals (P2PK 10,
// the corpus Counter's entry 0, its template hash recomputed from the artifact), and u16 bounds.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const COUNTER = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "covenant-counter-transition");

describe("F1.8 · compute budgets", () => {
  it("BU-1 the allowance of budgets 0–9 is each corpus answer's limit; 100,000 used units need budget 10 (the certified one)", () => {
    const evidence = JSON.parse(fs.readFileSync(path.join(COUNTER, "evidence.json"), "utf8"));
    const attempts: any[] = evidence.genesis.computeBudgetCertification.attempts;
    const refused = attempts.filter((a) => typeof a.nodeError === "string");
    expect(refused).toHaveLength(10);
    refused.forEach((a) => {
      const m = /used=(\d+), limit=(\d+)/.exec(String(a.nodeError))!;
      expect(v1ScriptUnitsAllowed(Number(a.budget))).toBe(BigInt(m[2]!));
      expect(v1BudgetForUnits(BigInt(m[1]!))).toBe(10);
    });
    expect(refused.map((a) => Number(a.budget))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(attempts.filter((a) => a.nodeError === undefined).map((a) => Number(a.budget))).toEqual([10]);
    expect(v1BudgetForUnits(9_999n)).toBe(0);
    expect(v1BudgetForUnits(10_000n)).toBe(1);
  });

  it("BU-2 proposals come only from certified values: P2PK 10, the Counter's covenant entry 0; anything else has none", () => {
    const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(COUNTER, "current.artifact.json"), "utf8")));
    const template = verifySilverTemplate(artifact, "Counter").templateHash;
    expect(Buffer.from(getSilContract(artifact, "Counter").contract.compiled.template_hash).toString("hex")).toBe(template);
    expect(proposeComputeBudget({ kind: "p2pk" })?.budget).toBe(10);
    expect(proposeComputeBudget({ kind: "covenant", templateHash: template, entry: "__covenant_entrypoint_auth_bump" })?.budget).toBe(0);
    expect(proposeComputeBudget({ kind: "covenant", templateHash: template, entry: "other" })).toBeUndefined();
    expect(proposeComputeBudget({ kind: "p2sh", templateHash: "00".repeat(32), entry: "release" })).toBeUndefined();
    for (const b of V1_CERTIFIED_COMPUTE_BUDGETS) expect(b.evidence).toMatch(/rusty-kaspad 2\.1\.0 simnet/);
  });

  it("BU-3 a budget is a u16 (V1_PLAN_INVALID); a use no u16 budget covers is refused", () => {
    expect(checkComputeBudget(65_535)).toBe(65_535);
    for (const bad of [-1, 65_536, 1.5, "10"]) expect(() => checkComputeBudget(bad)).toThrow(expect.objectContaining({ code: "V1_PLAN_INVALID" }));
    expect(() => v1BudgetForUnits(65_536n * 10_000n + 10_000n)).toThrow(expect.objectContaining({ code: "V1_PLAN_INVALID" }));
  });
});
