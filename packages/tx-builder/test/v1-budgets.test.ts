import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getSilContract, parseSilAbiArtifact, verifySilverTemplate } from "@hardkas/core";
import { checkComputeBudget, estimateV1ComputeBudget, proposeComputeBudget, v1BudgetForUnits, v1ScriptUnitsAllowed, V1_CERTIFIED_COMPUTE_BUDGETS } from "../src/index.js";

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

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · the upstream estimate (rusty-kaspa estimate_script_units_upper_bound), asked for explicitly: signature
// operations of a static scan × 100,000 + 100 per script byte, the from-stack checks counted, OpZkPrecompile refused.
// -----------------------------------------------------------------------------

describe("V1-ENGINE-2 · the upstream compute-budget estimate", () => {
  const push = (hex: string) => {
    const n = hex.length / 2;
    return n <= 0x4b ? n.toString(16).padStart(2, "0") + hex : n <= 0xff ? "4c" + n.toString(16).padStart(2, "0") + hex : "4d" + Buffer.from([n & 0xff, n >> 8]).toString("hex") + hex;
  };
  // a P2SH lock (version 0, BLAKE2B <32 bytes> EQUAL): the estimate reads only its shape, not which script it commits to
  const p2shOf = (_redeemHex: string) => "0000aa20" + "77".repeat(32) + "87";
  const SIG = "aa".repeat(65);

  it("BU-4 a P2PK input: 1 signature operation, 66 + 34 bytes → 110,000 units, budget 11 (one more than the certified 10: an estimate errs high)", () => {
    const e = estimateV1ComputeBudget({ signatureScriptHex: push(SIG), scriptPublicKeyHex: "000020" + "bb".repeat(32) + "ac" });
    expect([e.sigOps, e.units, e.budget]).toEqual([1, 110_000n, 11]);
    expect(e.source).toBe("rusty-kaspa estimate_script_units_upper_bound");
  });

  it("BU-5 a P2SH input scans its redeem script (the last push): two OpCheckSig, a 2-of-3 OpCheckMultiSig (its small-int count), an unknown multisig count (20), the from-stack checks", () => {
    const pk = "20" + "cc".repeat(32);
    const twoSigs = `${pk}ad${pk}ac`; // <pk> CHECKSIGVERIFY <pk> CHECKSIG
    const e1 = estimateV1ComputeBudget({ signatureScriptHex: push(SIG) + push(SIG) + push(twoSigs), scriptPublicKeyHex: p2shOf(twoSigs) });
    const len1 = (2 * 66 + 1 + twoSigs.length / 2) + 35;
    expect([e1.sigOps, e1.units]).toEqual([2, 200_000n + BigInt(len1) * 100n]);
    const multi = `52${pk}${pk}${pk}53ae`; // 2 <pk> <pk> <pk> 3 CHECKMULTISIG
    expect(estimateV1ComputeBudget({ signatureScriptHex: push(SIG) + push(multi), scriptPublicKeyHex: p2shOf(multi) }).sigOps).toBe(3);
    const unknownCount = `${pk}${pk}ae`;
    expect(estimateV1ComputeBudget({ signatureScriptHex: push(unknownCount), scriptPublicKeyHex: p2shOf(unknownCount) }).sigOps).toBe(20);
    const fromStack = `${pk}d7${pk}d8`;
    expect(estimateV1ComputeBudget({ signatureScriptHex: push(fromStack), scriptPublicKeyHex: p2shOf(fromStack) }).sigOps).toBe(2);
  });

  it("BU-6 an incomplete signature script counts no signature operation (as upstream); OpZkPrecompile has no estimate (V1_COMPUTE_BUDGET_REQUIRED)", () => {
    const truncated = "4c05aabb"; // PUSHDATA1 of 5 bytes with 2 present
    expect(estimateV1ComputeBudget({ signatureScriptHex: truncated, scriptPublicKeyHex: p2shOf("") }).sigOps).toBe(0);
    const zk = "20" + "cc".repeat(32) + "a6";
    expect(() => estimateV1ComputeBudget({ signatureScriptHex: push(zk), scriptPublicKeyHex: p2shOf(zk) })).toThrow(expect.objectContaining({ code: "V1_COMPUTE_BUDGET_REQUIRED" }));
    expect(() => estimateV1ComputeBudget({ signatureScriptHex: "zz", scriptPublicKeyHex: "0000" })).toThrow(expect.objectContaining({ code: "V1_PLAN_INVALID" }));
  });
});
