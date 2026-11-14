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

// -----------------------------------------------------------------------------
// G5 (kaspa-agent-notes cross-check) · the patterns `silver audit` missed or downgraded: a path guarded only by a hash or
// a time lock (it was LOW / LOW, and the text called hashlock puzzles legitimately permissionless), no single-input rule
// (IN-01), more than 15 signature operations in the redeem script (G2: the node refuses every spend), the lock time read
// without CheckLockTimeVerify. Sources parsed by the pinned silverc (--ast-only).
// -----------------------------------------------------------------------------

const audit = async (source: string) => analyzeSilverScriptSecurity({ source, ast: await parseSilverSourceAst(source) });
const CHECK = "        require(checkSig(s, owner));";
const checks = (n: number) => Array.from({ length: n }, () => CHECK).join("\n");

const GUARDS_SIL = `pragma silverscript ^0.1.0;

contract Guards(pubkey owner, byte[32] digest, int period, byte[] payee, int amount) {
    entry claimSecret(byte[] secret) {
        require(sha256(secret) == digest);
    }

    entry afterPeriod() {
        require(this.ageDaa >= period);
    }

    entry pinnedClaim(byte[] secret) {
        require(sha256(secret) == digest);
        require(tx.inputs.length == 1);
        require(tx.outputs[0].scriptPubKey == payee);
        require(tx.outputs[0].value >= amount);
    }

    entry signedPayout(sig s) {
${CHECK}
        require(tx.outputs[0].scriptPubKey == payee);
        require(tx.outputs[0].value >= amount);
    }

    entry singleSignedPayout(sig s) {
${CHECK}
        require(tx.inputs.length == 1);
        require(tx.outputs[0].value >= amount);
    }

    entry fakeLock(sig s) {
        require(OpTxLockTime() >= period);
${CHECK}
    }

    entry realLock(sig s) {
        require(tx.daa >= period);
${CHECK}
    }
}
`;

describe("G5 · silver audit: hash and time-lock paths, IN-01, signature operations, lock time without CLTV", () => {
  let report: Awaited<ReturnType<typeof audit>>;
  const of = (ruleId: string, fn: string) => report.findings.filter((f) => f.ruleId === ruleId && f.functionName === fn);

  it("G5-1 a path guarded only by a hash or a time lock is HIGH (it was LOW / LOW); with its outputs pinned, MEDIUM; no 'legitimately permissionless' text", async () => {
    report = await audit(GUARDS_SIL);
    expect(of("COV-AUTH-001", "claimSecret").map((f) => [f.severity, f.confidence])).toEqual([["HIGH", "MEDIUM"]]);
    expect(of("COV-AUTH-001", "afterPeriod").map((f) => [f.severity, f.confidence])).toEqual([["HIGH", "MEDIUM"]]);
    expect(of("COV-AUTH-001", "pinnedClaim").map((f) => [f.severity, f.confidence])).toEqual([["MEDIUM", "MEDIUM"]]);
    const secret = of("COV-AUTH-001", "claimSecret")[0]!;
    expect(secret.title).toMatch(/hash preimage/);
    expect(secret.threatModel).toMatch(/mempool/);
    expect(of("COV-AUTH-001", "afterPeriod")[0]!.title).toMatch(/time lock/);
    for (const f of report.findings) expect(f.limitations, f.ruleId).not.toMatch(/legitimately/);
    // a signature check is an authorization: no COV-AUTH-001 there
    for (const fn of ["signedPayout", "singleSignedPayout", "fakeLock", "realLock"]) expect(of("COV-AUTH-001", fn), fn).toEqual([]);
  });

  it("G5-2 COV-INPUT-001: outputs checked without tx.inputs.length == 1 — LOW with a signature, MEDIUM without; none when the input count is pinned", () => {
    expect(of("COV-INPUT-001", "signedPayout").map((f) => f.severity)).toEqual(["LOW"]);
    expect(of("COV-INPUT-001", "singleSignedPayout")).toEqual([]);
    expect(of("COV-INPUT-001", "pinnedClaim")).toEqual([]);
    // reads no output: nothing to merge against
    expect(of("COV-INPUT-001", "claimSecret")).toEqual([]);
  });

  it("G5-3 COV-LOCKTIME-001: OpTxLockTime() without tx.daa / tx.time is MEDIUM; tx.daa (CheckLockTimeVerify) is not flagged", () => {
    expect(of("COV-LOCKTIME-001", "fakeLock").map((f) => [f.severity, f.confidence])).toEqual([["MEDIUM", "HIGH"]]);
    expect(of("COV-LOCKTIME-001", "realLock")).toEqual([]);
    expect(report.findings.filter((f) => f.ruleId === "COV-SIGOPS-001")).toEqual([]);
  });

  it("G5-4 COV-SIGOPS-001: the whole script counts (every entry, a helper at each call site, loops by their bound): 16 and 17 are HIGH, 15 is not", async () => {
    const two = (heavy: number) => `pragma silverscript ^0.1.0;\n\ncontract H(pubkey owner) {\n    entry cheap(sig s) {\n${CHECK}\n    }\n\n    entry heavy(sig s) {\n${checks(heavy)}\n    }\n}\n`;
    const r16 = await audit(two(15));
    const f16 = r16.findings.filter((f) => f.ruleId === "COV-SIGOPS-001");
    expect(f16.map((f) => [f.severity, f.confidence, f.functionName])).toEqual([["HIGH", "HIGH", "heavy"]]);
    expect(f16[0]!.title).toMatch(/counts 16 signature operations/);
    expect(f16[0]!.description).toMatch(/cheap 1, heavy 15; 16 in all/);
    expect((await audit(two(14))).findings.filter((f) => f.ruleId === "COV-SIGOPS-001")).toEqual([]);

    // a helper of two checks called 8 times, and a loop of 1 check by 2 (silverc inlines and unrolls: 16 + 2 = 18)
    const inlined = `pragma silverscript ^0.1.0;\n\ncontract I(pubkey owner) {\n    function two(sig s) {\n${CHECK}\n${CHECK}\n    }\n\n    entry heavy(sig s) {\n${Array.from({ length: 8 }, () => "        two(s);").join("\n")}\n        for (i, 0, 2, 2) {\n    ${CHECK}\n        }\n    }\n}\n`;
    expect((await audit(inlined)).findings.filter((f) => f.ruleId === "COV-SIGOPS-001").map((f) => f.title)).toEqual([
      "Redeem script counts 18 signature operations: above the mempool's limit of 15 per P2SH input"
    ]);

    // a loop bound that is a constructor value: the count is a lower bound, said so, MEDIUM confidence
    const unbounded = `pragma silverscript ^0.1.0;\n\ncontract U(pubkey owner, int maxN) {\n    entry heavy(sig s) {\n${checks(16)}\n        for (i, 0, 3, maxN) {\n    ${CHECK}\n        }\n    }\n}\n`;
    const u = (await audit(unbounded)).findings.filter((f) => f.ruleId === "COV-SIGOPS-001");
    expect(u.map((f) => [f.severity, f.confidence])).toEqual([["HIGH", "MEDIUM"]]);
    expect(u[0]!.title).toMatch(/counts at least 17 signature operations/);
  });

  it("G5-5 the repository's corpus contracts and examples: no COV-SIGOPS-001 and no COV-LOCKTIME-001 (they stay under the limit and read no lock time)", async () => {
    const corpus = path.join(repoRoot, "fixtures", "toccata-v2", "silver");
    const files = [
      ...fs
        .readdirSync(corpus, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((d) => fs.readdirSync(path.join(corpus, d.name)).filter((f) => f.endsWith(".sil")).map((f) => path.join(corpus, d.name, f))),
      ownedCounterPath,
      path.join(repoRoot, "examples", "10-covenant-dev-framework", "contracts", "guarded-vault-counter.sil")
    ];
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const r = await audit(fs.readFileSync(file, "utf8"));
      expect(r.findings.filter((f) => f.ruleId === "COV-SIGOPS-001" || f.ruleId === "COV-LOCKTIME-001"), file).toEqual([]);
    }
  });
});
