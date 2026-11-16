import { describe, it, expect } from "vitest";
import { assertLockTimeMeetsContractEntry, contractEntryLockTimeRequirements } from "../src/contract-lock-time.js";

// -----------------------------------------------------------------------------
// R3-F · what a SilverScript entry's top-level `require(tx.daa >= x)` / `require(tx.time >= t)` ask of a spend's lock
// time. The AST nodes below are the shapes `silverc --ast-only` (v1.0.0) writes for these statements (probed, R3-F:
// require_tx_daa / require_tx_time with data.expr, variable_definition with data.name, `if` with then_branch).
// The node's rule (OpCheckLockTimeVerify: other kind → "mismatched locktime types", below x → "Unsatisfied lock time")
// is proven on rusty-kaspad by cltv-v1-engine-cli-node.simnet.test.ts and cltv-ecdsa-node.simnet.test.ts (S-1).
// -----------------------------------------------------------------------------

const id = (name: string) => ({ kind: "identifier", data: name, span: name });
const int = (n: number) => ({ kind: "int", data: n, span: String(n) });
const daa = (expr: any) => ({ kind: "require_tx_daa", data: { expr, message: null, span: `require(tx.daa >= ${expr.span});`, target_span: "tx.daa" } });
const time = (expr: any) => ({ kind: "require_tx_time", data: { expr, message: null, span: `require(tx.time >= ${expr.span});`, target_span: "tx.time" } });
const checkSig = { kind: "require", data: { expr: { kind: "call", data: { name: "checkSig", args: [id("ownerSig"), id("owner")] } }, span: "require(checkSig(ownerSig, owner));" } };
const param = (name: string, base: string) => ({ type_ref: { base }, name });

const contract = (functions: any[], params = [param("owner", "pubkey"), param("unlockAt", "int")]) => ({ name: "Locks", params, functions });
const entry = (name: string, body: any[], params = [param("ownerSig", "sig")]) => ({ name, params, entrypoint: true, body });

const ctor = [{ kind: "bytes", value: [7] }, { kind: "int", value: 1153n }];
const codeOf = (f: () => void) => {
  try {
    f();
    return "PASSED";
  } catch (e: any) {
    return String(e?.code ?? "UNCODED");
  }
};

describe("R3-F · contract entry lock-time requirements (AST)", () => {
  it("LT-1 a constructor parameter: the kind and x read; the spend's lock time checked against both", () => {
    const ast = contract([entry("claim", [daa(id("unlockAt")), checkSig])]);
    const req = contractEntryLockTimeRequirements({ ast, entry: "claim", constructorArgs: ctor });
    expect(req).toEqual([{ kind: "daaScore", atLeast: 1153n, statement: "require(tx.daa >= unlockAt);" }]);
    expect(codeOf(() => assertLockTimeMeetsContractEntry(1153n, req, "Locks.claim"))).toBe("PASSED");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(5000n, req, "Locks.claim"))).toBe("PASSED");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(1152n, req, "Locks.claim"))).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(0n, req, "Locks.claim"))).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(600_000_000_000n, req, "Locks.claim"))).toBe("LOCK_TIME_KIND_MISMATCH");
  });

  it("LT-2 constructor values unknown (a v0 spend): only the kind is checked", () => {
    const ast = contract([entry("claim", [daa(id("unlockAt")), checkSig])]);
    const req = contractEntryLockTimeRequirements({ ast, entry: "claim" });
    expect(req).toEqual([{ kind: "daaScore", statement: "require(tx.daa >= unlockAt);" }]);
    expect(codeOf(() => assertLockTimeMeetsContractEntry(0n, req, "Locks.claim"))).toBe("PASSED");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(1n, req, "Locks.claim"))).toBe("PASSED");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(500_000_000_000n, req, "Locks.claim"))).toBe("LOCK_TIME_KIND_MISMATCH");
  });

  it("LT-3 tx.time: a DAA-score lock and no lock time are the other kind; an entry argument and a literal give x", () => {
    const ast = contract([entry("byTime", [time(id("at")), time(int(600_000_000_001)), checkSig], [param("ownerSig", "sig"), param("at", "temporal")])]);
    const req = contractEntryLockTimeRequirements({ ast, entry: "byTime", constructorArgs: ctor, entryArgs: [{ kind: "signer", signer: "alice" }, { kind: "int", value: "600000000000" }] });
    expect(req.map((r) => [r.kind, r.atLeast])).toEqual([
      ["timestampMs", 600_000_000_000n],
      ["timestampMs", 600_000_000_001n]
    ]);
    expect(codeOf(() => assertLockTimeMeetsContractEntry(0n, req, "Locks.byTime"))).toBe("LOCK_TIME_KIND_MISMATCH");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(1153n, req, "Locks.byTime"))).toBe("LOCK_TIME_KIND_MISMATCH");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(600_000_000_000n, req, "Locks.byTime"))).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(codeOf(() => assertLockTimeMeetsContractEntry(600_000_000_001n, req, "Locks.byTime"))).toBe("PASSED");
  });

  it("LT-4 nothing invented: a statement under `if`, an expression, a redefined name, a parameter of both scopes, an unsafe literal, another entry", () => {
    const conditional = { kind: "if", data: { condition: { kind: "binary", data: { op: "gt", left: id("unlockAt"), right: int(5) } }, then_branch: [time(int(600_000_000_000))], else_branch: null } };
    const sum = daa({ kind: "binary", data: { op: "add", left: int(1234), right: id("unlockAt") }, span: "1234 + unlockAt" });
    const local = { kind: "variable_definition", data: { type_ref: { base: "int" }, name: "late", expr: int(9), span: "int late = 9;" } };
    const ast = contract([
      entry("cond", [conditional, checkSig]),
      entry("expr", [sum, checkSig]),
      entry("local", [local, daa(id("late")), checkSig], [param("ownerSig", "sig"), param("late", "int")]),
      entry("both", [daa(id("unlockAt")), checkSig], [param("ownerSig", "sig"), param("unlockAt", "int")]),
      entry("big", [time({ kind: "int", data: 2 ** 60, span: "1152921504606846976" }), checkSig]),
      { name: "helper", params: [], entrypoint: false, body: [daa(int(99))] }
    ]);
    const of = (name: string, entryArgs?: unknown[]) => contractEntryLockTimeRequirements({ ast, entry: name, constructorArgs: ctor, ...(entryArgs ? { entryArgs } : {}) });
    expect(of("cond")).toEqual([]);
    expect(of("expr")).toEqual([{ kind: "daaScore", statement: "require(tx.daa >= 1234 + unlockAt);" }]);
    expect(of("local", [{ kind: "signer", signer: "a" }, { kind: "int", value: "77" }])).toEqual([{ kind: "daaScore", statement: "require(tx.daa >= late);" }]);
    expect(of("both", [{ kind: "signer", signer: "a" }, { kind: "int", value: "77" }])).toEqual([{ kind: "daaScore", statement: "require(tx.daa >= unlockAt);" }]);
    expect(of("big")).toEqual([{ kind: "timestampMs", statement: "require(tx.time >= 1152921504606846976);" }]);
    expect(of("helper")).toEqual([]);
    expect(of("__covenant_entrypoint_auth_step")).toEqual([]);
    expect(contractEntryLockTimeRequirements({ ast: undefined, entry: "claim" })).toEqual([]);
  });

  it("LT-6 a covenant: the leader's policy (a #[covenant] function) is read through `policy`; its parameters are never bound to the entry's arguments", () => {
    const policyFn = {
      name: "step",
      attributes: [{ path: ["covenant", "singleton"], args: [] }],
      params: [param("prev_state", "State"), param("at", "int")],
      entrypoint: false,
      body: [daa(id("unlockAt")), daa(id("at")), { kind: "return", data: { exprs: [id("next_states")] } }]
    };
    const plain = { ...policyFn, name: "plain", attributes: [] };
    const ast = contract([policyFn, plain]);
    const req = contractEntryLockTimeRequirements({ ast, entry: "__covenant_entrypoint_auth_step", policy: "step", constructorArgs: ctor, entryArgs: [{ kind: "int", value: "1" }, { kind: "int", value: "2" }] });
    expect(req).toEqual([
      { kind: "daaScore", atLeast: 1153n, statement: "require(tx.daa >= unlockAt);" },
      { kind: "daaScore", statement: "require(tx.daa >= at);" }
    ]);
    expect(contractEntryLockTimeRequirements({ ast, entry: "__covenant_entrypoint_auth_step", constructorArgs: ctor })).toEqual([]);
    expect(contractEntryLockTimeRequirements({ ast, entry: "x", policy: "plain", constructorArgs: ctor })).toEqual([]);
  });

  it("LT-5 the refusal names the statement and what to give; a signer slot is never read as a value", () => {
    const ast = contract([entry("claim", [daa(id("ownerSig")), checkSig])]);
    const req = contractEntryLockTimeRequirements({ ast, entry: "claim", constructorArgs: ctor, entryArgs: [{ kind: "signature", privateKey: "11".repeat(32) }] });
    expect(req).toEqual([{ kind: "daaScore", statement: "require(tx.daa >= ownerSig);" }]);
    let message = "";
    try {
      assertLockTimeMeetsContractEntry(700_000_000_000n, req, "Locks.claim");
    } catch (e: any) {
      message = String(e?.message);
      expect(e?.code).toBe("LOCK_TIME_KIND_MISMATCH");
      expect(e?.metadata?.required ?? e?.details?.required ?? e?.detail?.required).toBe("daaScore");
    }
    expect(message).toMatch(/require\(tx\.daa >= ownerSig\);/);
    expect(message).toMatch(/--lock-time-daa/);
    expect(message).toMatch(/Nothing was signed/);
    expect(message).not.toMatch(/11{8}/);
  });
});
