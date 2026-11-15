import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SILVER_NODE_TEST_NOT_REPRODUCIBLE_CODES,
  loadManagedKaspaWasmSync,
  parseSilAbiArtifact,
  planSilverNodeTests,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  type SilAbiArtifact,
  type SilverNodeTestCase
} from "../src/index.js";

// -----------------------------------------------------------------------------
// R4-S · planSilverNodeTests: which runner test cases are real transactions a node can judge, and the spend each one
// describes. Pure (kaspa-wasm for scripts and addresses only): nothing is read, signed or sent. The node verdicts are
// proven by packages/cli/test/silver-test-on-node.simnet.test.ts.
// -----------------------------------------------------------------------------

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "toccata-v2", "silver");
const artifactOf = (dir: string, stem: string): SilAbiArtifact =>
  parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(CORPUS, dir, `${stem}.artifact.json`), "utf8")));
const signed = artifactOf("p2sh-signed-release", "contract");
const counter = artifactOf("covenant-counter-transition", "current");

/** An artifact whose entry takes every argument kind the reader handles (the bytecode is any script: never executed). */
const typed: SilAbiArtifact = parseSilAbiArtifact({
  schema_version: 1,
  compiler_version: "0.1.0",
  structs: { Pair: { fields: [{ name: "a", type: { kind: "int" } }, { name: "b", type: { kind: "bool" } }] } },
  contracts: {
    Typed: {
      source_path: "sil/Typed.sil",
      runtime_state: { source: "State", fields: [] },
      entries: {
        f: {
          dispatch_tag: "01020304",
          params: [
            { name: "n", type: { kind: "int" } },
            { name: "ok", type: { kind: "bool" } },
            { name: "y", type: { kind: "byte" } },
            { name: "data", type: { kind: "bytes" } },
            { name: "pk", type: { kind: "pubkey" } },
            { name: "label", type: { kind: "string" } },
            { name: "xs", type: { kind: "dynamic_array", item: { kind: "int" } } },
            { name: "p", type: { kind: "struct", name: "Pair" } }
          ]
        }
      },
      compiled: { bytecode: [0x51], template_hash: new Array(32).fill(7), state_span: { offset: 0, len: 0 } }
    }
  }
});

const P2PK = `20${"11".repeat(32)}ac`;
const oneOut = { version: 0, inputs: [{ utxo_value: 1_000_000_000, sig_op_count: 1, sequence: 0 }], outputs: [{ value: 999_000_000, script_hex: P2PK }] };
const plan = (artifact: SilAbiArtifact, tests: unknown[]) => planSilverNodeTests({ artifact, tests: { tests }, networkId: "simnet" });
const one = (artifact: SilAbiArtifact, test: Record<string, unknown>): SilverNodeTestCase => plan(artifact, [{ name: "t", expect: "pass", ...test }]).cases[0]!;
const why = (c: SilverNodeTestCase) => (c.reproducible ? "REPRODUCIBLE" : c.code);
const codeOf = (f: () => unknown) => {
  try {
    f();
  } catch (e: any) {
    return String(e?.code);
  }
  return "NO_ERROR";
};
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const rawJSON = (JSON as unknown as { rawJSON: (t: string) => unknown }).rawJSON;

describe("R4-S · planSilverNodeTests: the real spend a case describes", () => {
  it("N1 a signed v0 case: one coin of utxo_value at the contract's P2SH, the account as signer, the case's outputs, sequence and declared sig ops", () => {
    const p = plan(signed, [{ name: "release", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: oneOut }]);
    const bytecode = silContractBytecodeHex(signed.contracts.SignedRelease!);
    expect(p.contract).toBe("SignedRelease");
    expect(p.address).toBe(silverP2shAddress(bytecode, "simnet"));
    expect(p.lockingScript).toEqual(silverP2shLock(bytecode));
    const c = p.cases[0]!;
    expect(c.reproducible, show(c)).toBe(true);
    if (!c.reproducible) return;
    expect(c.txVersion).toBe(0);
    expect(c.signers).toEqual(["alice"]);
    expect(c.args).toEqual([{ kind: "signer", signer: "alice" }]);
    expect(c.utxoValueSompi).toBe(1_000_000_000n);
    expect(c.sequence).toBe(0n);
    expect(c.sigOpCount).toBe(1);
    expect(c.lockTime).toBe(0n);
    const k: any = loadManagedKaspaWasmSync();
    const p2pkAddress = String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(0, P2PK), "simnet").toString());
    expect(c.outputs).toEqual([{ amountSompi: 999_000_000n, scriptPublicKey: { version: 0, script: P2PK }, address: p2pkAddress }]);
  });

  it("N2 defaults: no version is 1 (as the runner reads it) with a note; v0 without sig_op_count declares the signature arguments (at least 1), never the runner's 100", () => {
    const v1 = one(signed, { function: "release", args: [{ signature: "alice" }], tx: { inputs: [{ utxo_value: 1_000_000_000 }], outputs: [{ value: 999_000_000, script_hex: P2PK }] } });
    expect(v1.reproducible && v1.txVersion).toBe(1);
    expect(v1.reproducible && v1.notes.join(" ")).toMatch(/version not stated: 1/);
    const v0 = one(signed, { function: "release", args: [{ signature: "alice" }], tx: { version: 0, inputs: [{ utxo_value: 1_000_000_000 }], outputs: [{ value: 999_000_000, script_hex: P2PK }] } });
    expect(v0.reproducible && v0.sigOpCount).toBe(1);
    expect(v0.reproducible && v0.notes.join(" ")).toMatch(/sig_op_count not stated: 1 declared/);
    const v1sigops = one(signed, { function: "release", args: [{ signature: "alice" }], tx: { version: 1, inputs: [{ utxo_value: 1_000_000_000, sig_op_count: 1 }], outputs: [{ value: 999_000_000, script_hex: P2PK }] } });
    expect(v1sigops.reproducible && v1sigops.notes.join(" ")).toMatch(/v1 input commits a compute budget/);
  });

  it("N3 an output with no script pays the contract's own P2SH; p2pk_pubkey is the runner's P2PK script; a u64 beyond 2^53 stays exact", () => {
    const big = 18_000_000_000_000_000_000n;
    const c = one(signed, {
      function: "release",
      args: [{ signature: "alice" }],
      tx: { version: 0, lock_time: rawJSON("1000"), inputs: [{ utxo_value: rawJSON(big.toString()), sequence: rawJSON("12") }], outputs: [{ value: 5 }, { value: 7, p2pk_pubkey: "22".repeat(32) }] }
    });
    expect(c.reproducible, show(c)).toBe(true);
    if (!c.reproducible) return;
    expect(c.utxoValueSompi).toBe(big);
    expect(c.sequence).toBe(12n);
    expect(c.lockTime).toBe(1000n);
    expect(c.outputs[0]!.scriptPublicKey.script).toBe(silverP2shLock(silContractBytecodeHex(signed.contracts.SignedRelease!)).script);
    expect(c.outputs[1]!.scriptPublicKey.script).toBe(`20${"22".repeat(32)}ac`);
  });

  it("N4 the arguments are read by the entry's ABI type as the runner reads them (top level: strings; nested: JSON values)", () => {
    const args = ["-42", "true", "0x07", "0xabcd", `0x${"33".repeat(32)}`, " hello ", "[1, 9007199254740993]", '{"a": 5, "b": false}'];
    const c = one(typed, { function: "f", args, tx: oneOut });
    expect(c.reproducible, show(c)).toBe(true);
    if (!c.reproducible) return;
    expect(c.args).toEqual([
      { kind: "int", value: -42n },
      { kind: "bool", value: true },
      { kind: "byte", value: 7 },
      { kind: "bytes", value: [0xab, 0xcd] },
      { kind: "bytes", value: new Array(32).fill(0x33) },
      { kind: "text", value: "hello" },
      { kind: "array", value: [{ kind: "int", value: 1n }, { kind: "int", value: 9007199254740993n }] },
      { kind: "object", value: { a: { kind: "int", value: 5n }, b: { kind: "bool", value: false } } }
    ]);
    // the same values as parsed JSON (an array and an object directly in the file)
    const parsed = one(typed, { function: "f", args: [rawJSON("-42"), true, "0x07", "0xabcd", `0x${"33".repeat(32)}`, "hello", [1, 2], { a: 5, b: false }], tx: oneOut });
    expect(parsed.reproducible, show(parsed)).toBe(true);
  });

  it("N5 an argument HardKAS cannot read as the runner does is ARGUMENT_UNREADABLE (the node would test another value), and so is a wrong count", () => {
    const base = ["1", "true", "0x07", "0xab", `0x${"33".repeat(32)}`, "x", "[1]", '{"a":1,"b":true}'];
    const swap = (i: number, v: unknown) => base.map((x, j) => (j === i ? v : x));
    for (const [i, v] of [
      [0, "1.5"],
      [0, "0x10"],
      [1, "yes"],
      [2, "0x0102"],
      [3, "abcd"],
      [6, "[1.5]"],
      [6, '["1"]'],
      [7, '{"a":1}'],
      [7, '{"a":1,"b":true,"c":2}']
    ] as const) {
      const c = one(typed, { function: "f", args: swap(i, v), tx: oneOut });
      expect(why(c), `${i} ${String(v)}`).toBe("ARGUMENT_UNREADABLE");
    }
    expect(why(one(typed, { function: "f", args: base.slice(1), tx: oneOut }))).toBe("ARGUMENT_UNREADABLE");
  });

  it("N6 a literal sig signs the runner's scenario, not the real spend: SCENARIO_SIGNATURE", () => {
    const c = one(signed, { function: "release", args: [`0x${"00".repeat(65)}`], tx: oneOut });
    expect(why(c)).toBe("SCENARIO_SIGNATURE");
    expect(!c.reproducible && c.reason).toMatch(/\{"signature":"<account>"\}/);
  });

  it("N7 scenarios no node transaction reproduces: each NOT_REPRODUCIBLE with its own code and reason, never a pass", () => {
    const sig = [{ signature: "alice" }];
    const cases: Array<[string, Record<string, unknown>]> = [
      ["RUNNER_DEFAULT_SCENARIO", { function: "release", args: sig }],
      ["NOT_A_CONTRACT_ENTRY", { function: "missing", args: [], tx: oneOut }],
      ["NOT_A_CONTRACT_ENTRY", { function: "constructor", args: [], tx: oneOut }],
      ["MULTIPLE_INPUTS", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: 1 }, { utxo_value: 2 }] } }],
      ["FABRICATED_OUTPOINT", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: 1_000_000_000, prev_txid: "ab".repeat(32) }] } }],
      ["FABRICATED_OUTPOINT", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: 1_000_000_000, prev_index: 3 }] } }],
      ["FOREIGN_INPUT_SCRIPT", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: 1_000_000_000, utxo_script_hex: P2PK }] } }],
      ["COVENANT_CONTEXT", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: 1_000_000_000, covenant_id: "cd".repeat(32) }] } }],
      ["COVENANT_CONTEXT", { function: "release", args: sig, tx: { ...oneOut, outputs: [{ value: 1, authorizing_input: 0 }] } }],
      ["NO_OUTPUTS", { function: "release", args: sig, tx: { ...oneOut, outputs: [] } }],
      ["OUTPUT_WITHOUT_ADDRESS", { function: "release", args: sig, tx: { ...oneOut, outputs: [{ value: 1, script_hex: "6a04deadbeef" }] } }],
      ["TX_VERSION_UNSUPPORTED", { function: "release", args: sig, tx: { ...oneOut, version: 2 } }],
      ["VALUE_OUT_OF_RANGE", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: 0 }] } }],
      ["VALUE_OUT_OF_RANGE", { function: "release", args: sig, tx: { ...oneOut, inputs: [{ utxo_value: -5 }] } }],
      ["VALUE_OUT_OF_RANGE", { function: "release", args: sig, tx: { ...oneOut, outputs: [{ value: -1, script_hex: P2PK }] } }]
    ];
    const p = plan(signed, cases.map(([, t], i) => ({ name: `c${i}`, expect: "fail", ...t })));
    expect(p.cases.map(why)).toEqual(cases.map(([code]) => code));
    for (const c of p.cases) {
      expect(c.reproducible).toBe(false);
      if (!c.reproducible) {
        expect(SILVER_NODE_TEST_NOT_REPRODUCIBLE_CODES).toContain(c.code);
        expect(c.reason.length, c.code).toBeGreaterThan(20);
      }
    }
  });

  it("N8 a covenant entry (policy name or generated entry) is COVENANT_CONTEXT: its transaction carries covenant state", () => {
    const tx = { version: 1, inputs: [{ utxo_value: 1_000_000_000 }], outputs: [{ value: 999_000_000 }] };
    expect(why(one(counter, { function: "bump", args: ["1"], tx }))).toBe("COVENANT_CONTEXT");
    expect(why(one(counter, { function: "__covenant_entrypoint_auth_bump", args: [], tx }))).toBe("COVENANT_CONTEXT");
  });

  it("N9 the test file's own errors are the runner mode's usage errors (same codes as prepareSilverVmTests)", () => {
    expect(codeOf(() => plan(signed, [{ name: "t", function: "release", args: ["1"], expect: "pass", tx: oneOut, constructor_args: [] }]))).toBe("SILVER_TEST_CONSTRUCTOR_ARGS_FORBIDDEN");
    expect(codeOf(() => plan(signed, [{ name: "t", function: "release", args: ["1"], expect: "pass", tx: oneOut, extra: 1 }]))).toBe("SILVER_TEST_FILE_INVALID");
    expect(codeOf(() => plan(signed, [{ name: "t", function: "release", args: ["1"], expect: "maybe", tx: oneOut }]))).toBe("SILVER_TEST_FILE_INVALID");
    expect(codeOf(() => plan(typed, [{ name: "t", function: "f", args: [{ signature: "alice" }], expect: "pass", tx: oneOut }]))).toBe("SILVER_TEST_SIGNATURE_SLOT_INVALID");
    expect(codeOf(() => plan(signed, [{ name: "t", function: "nope", args: [{ signature: "alice" }], expect: "pass", tx: oneOut }]))).toBe("SILVER_TEST_SIGNATURE_UNSUPPORTED");
    expect(codeOf(() => plan(signed, [{ name: "t", function: "release", args: [], expect: "pass", tx: { ...oneOut, inputs: [{ utxo_value: 1, signature_script_hex: "00" }] } }]))).toBe("SILVER_TEST_UNLOCK_NOT_EXECUTED");
    expect(codeOf(() => plan(signed, [{ name: "t", function: "release", args: [], expect: "pass", tx: { ...oneOut, inputs: [{ utxo_value: 1.5 }] } }]))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(codeOf(() => planSilverNodeTests({ artifact: signed, tests: { tests: [] }, networkId: "simnet" }))).toBe("SILVER_TEST_FILE_INVALID");
  });

  it("N10 the addresses are the request's network's", () => {
    const p = planSilverNodeTests({ artifact: signed, tests: { tests: [{ name: "t", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: oneOut }] }, networkId: "testnet-10" });
    expect(p.address).toMatch(/^kaspatest:/);
    expect(p.cases[0]!.reproducible && p.cases[0]!.outputs[0]!.address).toMatch(/^kaspatest:/);
  });
});
