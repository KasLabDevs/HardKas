import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// `hardkas kcc` and `hardkas kcc20`: the KCC conventions off chain, through the built CLI. Values from the official
// KCC-1 and KCC-20 vectors (kaspanet/kccs@1ed87aef). The transfer check lists signatures and never verifies them.
// Canonical level: no node, no compiler, no runner.
// -----------------------------------------------------------------------------

let ws = "";
beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-kcc-cli-"));
});
afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

function run(args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env: childEnv({ NO_COLOR: "1" }), encoding: "utf8", timeout: 60_000 });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { exit: r.status, json, text: `${r.stdout}\n${r.stderr}` };
}
const write = (name: string, value: unknown) => {
  const p = path.join(ws, name);
  fs.writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value));
  return p;
};

const STATE = { amount: "1000", owner: "11".repeat(32), ownerScheme: 1, borrowScheme: 1, borrowGuard: `f401000000000000${"00".repeat(24)}`, extensionCommitment: "00".repeat(32) };
const ENCODED = "08e8030000000000002011111111111111111111111111111111111111111111111111111111111111110101010120f401000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000";

describe("hardkas kcc", () => {
  it("C1 dispatch: the KCC-20 transfer signature's tag is 79c71c23", () => {
    const r = run(["kcc", "dispatch", "transfer({int,byte[32],byte,byte,byte[32],byte[32]}[],byte[])", "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json.dispatchTag).toBe("79c71c23");
    for (const sig of ["transfer(int, bool)", "transfer(KCC20State[],byte[])", "x({)"]) {
      const bad = run(["kcc", "dispatch", sig, "--json"]);
      expect(bad.exit, `${sig}: ${bad.text}`).toBe(2);
      expect(bad.text).toContain("KCC1_TYPE_INVALID");
    }
  });

  it("C2 template-hash: the KCC-1 vector for prefix 61, suffix 6263", () => {
    const r = run(["kcc", "template-hash", "--prefix", "61", "--suffix", "6263", "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json.templateHash).toBe("405e183e2494cdbe2df89349cc0ffa5b77fb885ad97a1d5660ecd0692ef8142a");
    expect(run(["kcc", "template-hash", "--prefix", "0x61", "--suffix", "", "--json"]).exit).toBe(2);
  });
});

describe("hardkas kcc20", () => {
  it("C3 encode-state writes the KCC-20 vector's 112 bytes; a negative amount or an unassigned scheme is refused", () => {
    const r = run(["kcc20", "encode-state", write("state.json", STATE), "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect([r.json.encodedState, r.json.length]).toEqual([ENCODED, 112]);
    for (const [label, over] of [["negative amount", { amount: "-1" }], ["borrow scheme 0x7f", { borrowScheme: 0x7f }], ["owner scheme 0x05", { ownerScheme: 5 }]] as const) {
      const bad = run(["kcc20", "encode-state", JSON.stringify({ ...STATE, ...over }), "--json"]);
      expect(bad.exit, `${label}: ${bad.text}`).toBe(2);
      expect(bad.text).toContain("KCC20_STATE_INVALID");
    }
  });

  it("C4 exact integers: an amount past 2^53 as a JSON number is refused, as a decimal string it is kept exact", () => {
    const unsafe = run(["kcc20", "encode-state", `{"amount":9007199254740993,"owner":"${"11".repeat(32)}","ownerScheme":0,"borrowScheme":0,"borrowGuard":"${"00".repeat(32)}","extensionCommitment":"${"00".repeat(32)}"}`, "--json"]);
    expect(unsafe.exit, unsafe.text).toBe(2);
    expect(unsafe.text).toContain("KCC_JSON_NUMBER_UNSAFE");
    const exact = run(["kcc20", "encode-state", JSON.stringify({ ...STATE, amount: "9007199254740993" }), "--json"]);
    expect(exact.exit, exact.text).toBe(0);
    const back = run(["kcc20", "decode-state", exact.json.encodedState, "--json"]);
    expect(back.json.state.amount).toBe("9007199254740993");
  });

  it("C4b an amount outside int64 (2^63) is a usage error as the help says (exit 2, KCC1_INT_OUT_OF_RANGE); 2^63 - 1 encodes", () => {
    const over = run(["kcc20", "encode-state", JSON.stringify({ ...STATE, amount: "9223372036854775808" }), "--json"]);
    expect(over.exit, over.text).toBe(2);
    expect(over.text).toContain("KCC1_INT_OUT_OF_RANGE");
    const max = run(["kcc20", "encode-state", JSON.stringify({ ...STATE, amount: "9223372036854775807" }), "--json"]);
    expect(max.exit, max.text).toBe(0);
  });

  it("C4c (I-05) check: a kasValueSompi past 2^64 - 1 is a usage error (KCC20_TRANSFER_INVALID), 2^64 - 1 is accepted", () => {
    const transfer = (kas: string) => ({
      inputs: [{ state: STATE, kasValueSompi: kas, witness: `00${"44".repeat(65)}` }],
      nextStates: [{ ...STATE, ownerScheme: 0, borrowScheme: 0 }],
      outputs: [{ state: { ...STATE, ownerScheme: 0, borrowScheme: 0 }, kasValueSompi: "1000" }]
    });
    const over = run(["kcc20", "check", JSON.stringify(transfer("18446744073709551616")), "--json"]);
    expect(over.exit, over.text).toBe(2);
    expect(over.text).toContain("KCC20_TRANSFER_INVALID");
    const max = run(["kcc20", "check", JSON.stringify(transfer("18446744073709551615")), "--json"]);
    expect(max.exit, max.text).not.toBe(2);
  });

  it("C5 decode-state is strict; a decodable state that breaks KCC-20 is reported, not hidden", () => {
    const r = run(["kcc20", "decode-state", ENCODED, "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json).toEqual({ state: STATE, kcc20Valid: true, problems: [] });
    const trailing = run(["kcc20", "decode-state", `${ENCODED}00`, "--json"]);
    expect(trailing.exit, trailing.text).toBe(2);
    expect(trailing.text).toMatch(/KCC1_DECODE_INVALID/);
    // amount -5: the KCC-1 codec decodes it, KCC-20 does not accept it
    const negative = ENCODED.replace("08e803000000000000", "080500000000000080");
    const n = run(["kcc20", "decode-state", negative, "--json"]);
    expect(n.exit, n.text).toBe(0);
    expect([n.json.state.amount, n.json.kcc20Valid, n.json.problems]).toEqual(["-5", false, ["amount is negative"]]);
  });

  const leader = { amount: "1000", owner: "11".repeat(32), ownerScheme: 0, borrowScheme: 0, borrowGuard: "00".repeat(32), extensionCommitment: "00".repeat(32) };
  const next = [
    { ...leader, amount: "600", owner: "22".repeat(32) },
    { ...leader, amount: "400", owner: "33".repeat(32), ownerScheme: 1, borrowScheme: 1 }
  ];
  const transfer = (nextStates: unknown[]) => ({
    inputs: [{ state: leader, kasValueSompi: "100000000", witness: `00${"44".repeat(65)}` }],
    nextStates,
    outputs: nextStates.map((s) => ({ state: s, kasValueSompi: "50000000" }))
  });

  it("C6 check: a well-formed transfer is STRUCTURALLY_VALID and its owner signature is listed as not verified", () => {
    const r = run(["kcc20", "check", write("ok.json", transfer(next)), "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json).toMatchObject({ kind: "kcc20-transfer-check", verdict: "STRUCTURALLY_VALID", path: "normal" });
    expect(r.json.signaturesNotVerified).toEqual([{ role: "leader-owner", familyInput: 0, scheme: "p2pk-schnorr/v1", publicKey: "11".repeat(32) }]);
    expect(r.json.scope).toMatch(/Signatures are NOT verified/);
  });

  it("C6b (R-06) the check's scope names what it takes from the caller: entrypoints, family and order, input states", () => {
    const r = run(["kcc20", "check", write("ok-scope.json", transfer(next)), "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json.scope).toMatch(/entrypoint each input calls/);
    expect(r.json.scope).toMatch(/taken from the caller's order/);
    expect(r.json.scope).toMatch(/input states, supplied by the caller/);
    expect(r.json.scope).toMatch(/continuation outputs' programs and covenant bindings/);
  });

  it("C7 check: conservation broken is REJECTED (exit 1, KCC20_TRANSFER_REJECTED); malformed input is usage (exit 2)", () => {
    const r = run(["kcc20", "check", write("bad.json", transfer([next[0], { ...next[1], amount: "500" }])), "--json"]);
    expect(r.exit, r.text).toBe(1);
    // --json renders the result and returns: the exit status carries the rejection (the CLI's runtime contract)
    expect(r.json).toMatchObject({ verdict: "REJECTED", rule: "conservation" });
    const text = run(["kcc20", "check", path.join(ws, "bad.json")]);
    expect(text.exit, text.text).toBe(1);
    expect(text.text).toContain("KCC20_TRANSFER_REJECTED");
    const typo = run(["kcc20", "check", JSON.stringify({ ...transfer(next), nextState: [] }), "--json"]);
    expect(typo.exit, typo.text).toBe(2);
    expect(typo.text).toContain("KCC20_TRANSFER_INVALID");
    // review L-5: a malformed transactionInputs is usage too, never a runtime TypeError
    for (const ti of [{ scriptPublicKeys: "x", covenantIds: [] }, { scriptPublicKeys: [{ version: 0, script: "zz" }], covenantIds: [] }, { scriptPublicKeys: [], covenantIds: ["00"] }]) {
      const r2 = run(["kcc20", "check", JSON.stringify({ ...transfer(next), transactionInputs: ti }), "--json"]);
      expect(r2.exit, r2.text).toBe(2);
      expect(r2.text).toContain("KCC20_TRANSFER_INVALID");
    }
  });

  it("C8 artifact: the reference implementation's kcc20.json form; an invalid one is refused", () => {
    const ok = run(["kcc20", "artifact", write("kcc20.json", { program: { artifact: "artifact.json" }, entrypoints: { transfer: "transfer", delegator: "transfer_delegator" }, owner_schemes: [0, 1, 2, 3, 4], max_token_inputs: 3, max_token_outputs: 3 }), "--json"]);
    expect(ok.exit, ok.text).toBe(0);
    expect([ok.json.entrypointTags.transfer.dispatchTag, ok.json.entrypointTags.delegator.dispatchTag]).toEqual(["79c71c23", "fd3ef14a"]);
    const bad = run(["kcc20", "artifact", write("bad-kcc20.json", { entrypoints: { transfer: "transfer", delegator: "transfer_delegator" }, owner_schemes: [9], max_token_inputs: 3, max_token_outputs: 3 }), "--json"]);
    expect(bad.exit, bad.text).toBe(2);
    expect(bad.text).toContain("KCC20_ARTIFACT_INVALID");
  });
});
