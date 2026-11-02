import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  analyzeSilverScriptSecurity,
  compileSilverScript,
  parseSilverSourceAst
} from "../src/index.js";

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterPath = path.join(
  repoRoot,
  "examples",
  "09-silver-reference",
  "contracts",
  "owned-counter.sil"
);

const GUARDED_VAULT_COUNTER_SIL = `pragma silverscript ^0.1.0;

contract GuardedVaultCounter(pubkey owner, int init_value, int max_fee) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta, sig s) : (State) {
        require(checkSig(s, owner));
        require(delta > 0);
        int out_idx = OpAuthOutputIdx(this.activeInputIndex, 0);
        require(tx.outputs[out_idx].value >= tx.inputs[this.activeInputIndex].value - max_fee);
        return(State { value: prev_state.value + delta });
    }
}
`;

const VULNERABLE_COVENANT_SIL = `pragma silverscript ^0.1.0;

contract VulnerableVault(int init_value) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition, termination = allowed)]
    function anyoneCanMutate(State prev_state, int next_val) : (State) {
        require(tx.inputs[0].value > 0);
        for (i, 0, 20, 20) {
            require(i >= 0);
        }
        return(State { value: next_val });
    }
}
`;

describe("Fase 4 · SilverScript Static Security Analyzer (PRUEBA G)", () => {
  it("detects missing output value protection (COV-VALUE-001) on OwnedCounter while confirming auth & state guards", async () => {
    const source = fs.readFileSync(ownedCounterPath, "utf8");
    const ast = await parseSilverSourceAst(source);
    const compiled = await compileSilverScript({
      source,
      constructorArgs: [
        { kind: "bytes", value: new Uint8Array(32).fill(0x11) },
        { kind: "int", value: 10n }
      ]
    });

    const report = await analyzeSilverScriptSecurity({
      source,
      file: "owned-counter.sil",
      ast,
      artifact: compiled.artifact
    });

    expect(report.schema).toBe("hardkas.silver.staticAudit.v1");
    expect(report.contractName).toBe("OwnedCounter");
    // OwnedCounter has checkSig(s, owner) and delta > 0 constraining State { value: prev_state.value + delta }
    expect(report.findings.some((f) => f.ruleId === "COV-AUTH-001")).toBe(false);
    expect(report.findings.some((f) => f.ruleId === "COV-STATE-001")).toBe(false);

    // OwnedCounter does NOT constrain tx.outputs[...].value -> COV-VALUE-001 MEDIUM
    const valueFinding = report.findings.find((f) => f.ruleId === "COV-VALUE-001");
    expect(valueFinding).toBeDefined();
    expect(valueFinding?.severity).toBe("MEDIUM");
    expect(valueFinding?.functionName).toBe("bump");
    expect(valueFinding?.location).not.toBe("SOURCE_LOCATION_UNAVAILABLE");
    if (valueFinding && valueFinding.location !== "SOURCE_LOCATION_UNAVAILABLE") {
      expect(valueFinding.location.line).toBeGreaterThan(0);
    }
  });

  it("detects COV-AUTH-001, COV-VALUE-001, COV-STATE-001, COV-INDEX-001, COV-TERM-001, and COV-BUDGET-001 on VulnerableVault", async () => {
    const ast = await parseSilverSourceAst(VULNERABLE_COVENANT_SIL);
    const compiled = await compileSilverScript({
      source: VULNERABLE_COVENANT_SIL,
      constructorArgs: [{ kind: "int", value: 1n }]
    });

    const report = await analyzeSilverScriptSecurity({
      source: VULNERABLE_COVENANT_SIL,
      file: "vulnerable-vault.sil",
      ast,
      artifact: compiled.artifact
    });

    const ruleIds = new Set(report.findings.map((f) => f.ruleId));
    expect(ruleIds.has("COV-AUTH-001")).toBe(true);
    expect(ruleIds.has("COV-VALUE-001")).toBe(true);
    expect(ruleIds.has("COV-STATE-001")).toBe(true);
    expect(ruleIds.has("COV-INDEX-001")).toBe(true);
    expect(ruleIds.has("COV-TERM-001")).toBe(true);
    expect(ruleIds.has("COV-BUDGET-001")).toBe(true);
    expect(report.summary.high).toBeGreaterThanOrEqual(2);
  });

  it("produces zero HIGH/MEDIUM findings on a hardened GuardedVaultCounter", async () => {
    const ast = await parseSilverSourceAst(GUARDED_VAULT_COUNTER_SIL);
    const compiled = await compileSilverScript({
      source: GUARDED_VAULT_COUNTER_SIL,
      constructorArgs: [
        { kind: "bytes", value: new Uint8Array(32).fill(0x22) },
        { kind: "int", value: 10n },
        { kind: "int", value: 500_000n }
      ]
    });

    const report = await analyzeSilverScriptSecurity({
      source: GUARDED_VAULT_COUNTER_SIL,
      file: "guarded-vault-counter.sil",
      ast,
      artifact: compiled.artifact
    });

    expect(report.summary.high).toBe(0);
    expect(report.summary.medium).toBe(0);
    expect(report.findings.filter((f) => f.severity === "HIGH" || f.severity === "MEDIUM")).toEqual([]);
  });
});
