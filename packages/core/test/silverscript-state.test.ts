import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeSilverRuntimeState,
  encodeSilverEntryArgs,
  encodeSilverRuntimeState,
  getSilContract,
  parseSilAbiArtifact,
  silContractBytecodeHex,
  silScriptNumber,
  silScriptNumberValue,
  silverContractParts,
  silverStateSuccessor,
  silverTemplateHash,
  verifySilverTemplate,
  type SilAbiArtifact,
  type SilArtifactValue
} from "../src/index.js";

// -----------------------------------------------------------------------------
// F1 phase 2 · the SilverScript state codec and the ABI's arrays and structs, against silverscript-abi v1.0.0: its own
// unit-test vectors (template hash KCC-1, sig-script, temporal, state scripts flat and nested) and the Silver corpus
// (the Counter's state 7 decoded from its silverc artifact, and its successor 12 rebuilt byte for byte from the template
// alone: the corpus successor's bytecode and P2SH aa209a21…). No compiler runs here.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COUNTER = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "covenant-counter-transition");
const json = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const int = (v: bigint | number): SilArtifactValue => ({ kind: "int", value: BigInt(v) });
const bytes = (v: number[]): SilArtifactValue => ({ kind: "bytes", value: v });

/** silverscript-abi's `tiny_sil_abi()` test artifact, with a runtime state and structs per test. */
function tiny(runtimeFields: Array<{ name: string; type: any }>, structs: Record<string, { fields: Array<{ name: string; type: any }> }> = {}, entries?: Record<string, any>): SilAbiArtifact {
  return {
    schema_version: 1,
    compiler_version: "0.1.0",
    structs,
    contracts: {
      Foo: {
        source_path: "sil/Foo.sil",
        runtime_state: { source: "FooState", fields: runtimeFields },
        entries: entries ?? {
          step: {
            dispatch_tag: "2c49ed65",
            params: [
              { name: "n", type: { kind: "int" } },
              { name: "hash", type: { kind: "fixed_bytes", len: 4 } },
              { name: "flag", type: { kind: "bool" } },
              { name: "b", type: { kind: "byte" } }
            ]
          },
          other: { dispatch_tag: "deadbeef", params: [] }
        },
        compiled: { bytecode: [], template_hash: new Array(32).fill(0), state_span: { offset: 0, len: 0 } }
      }
    }
  } as unknown as SilAbiArtifact;
}

describe("silverscript-abi v1.0.0 vectors", () => {
  it("SS-1 KCC-1 template hash vectors", () => {
    const h = (p: string, s: string) => silverTemplateHash(Buffer.from(p, "latin1").toString("hex"), Buffer.from(s, "latin1").toString("hex"));
    expect(h("", "")).toBe("e572dff82304700b856a555ac3a4558d0df3646a3727816500270a93c66aac1e");
    expect(h("a", "bc")).toBe("405e183e2494cdbe2df89349cc0ffa5b77fb885ad97a1d5660ecd0692ef8142a");
    expect(h("ab", "c")).toBe("a0968c014f3fc7bd1a7d9a8d1ad1177eb379bd2f05e56309eb4e20347c5e7eba");
    expect(silverTemplateHash("00ff", "100080")).toBe("6616a66757315de0221cb2acba729113cebde31f8d3ca7fa93878a0584b96905");
  });

  it("SS-2 script numbers: fixed width (state) and minimal (kaspa-txscript serialize_i64 / deserialize_i64)", () => {
    expect(Buffer.from(silScriptNumber(-5n, 8)).toString("hex")).toBe("0500000000000080");
    expect(Buffer.from(silScriptNumber(17n, 8)).toString("hex")).toBe("1100000000000000");
    expect(Buffer.from(silScriptNumber(128n)).toString("hex")).toBe("8000");
    expect(Buffer.from(silScriptNumber(-128n)).toString("hex")).toBe("8080");
    expect(Buffer.from(silScriptNumber(0n)).toString("hex")).toBe("");
    for (const v of [0n, 1n, -1n, 127n, 128n, -255n, 2n ** 62n, -(2n ** 63n) + 1n]) expect(silScriptNumberValue(silScriptNumber(v, 8))).toBe(v);
    expect(() => silScriptNumber(-(2n ** 63n), 8)).toThrow(expect.objectContaining({ code: "SILVER_ABI_ARGUMENT_INVALID" }));
  });

  it("SS-3 the sig-script of tiny_sil_abi step(17, 01020304, true, 1) is upstream's 011104010203045151042c49ed65", () => {
    const abi = tiny([]);
    expect(encodeSilverEntryArgs({ artifact: abi, entry: "step", args: [int(17), bytes([1, 2, 3, 4]), { kind: "bool", value: true }, { kind: "byte", value: 1 }] })).toBe(
      "011104010203045151042c49ed65"
    );
  });

  it("SS-4 temporal values: a minimal push for the scalar, 8-byte items for the array (upstream encodes_temporal_values_with_integer_payloads)", () => {
    const abi = tiny([], {}, { other: { dispatch_tag: "deadbeef", params: [{ name: "at", type: { kind: "temporal" } }, { name: "history", type: { kind: "dynamic_array", item: { kind: "temporal" } } }] } });
    const history: SilArtifactValue = { kind: "array", value: [int(1), int(-2)] };
    expect(encodeSilverEntryArgs({ artifact: abi, entry: "other", args: [int(-5), history] })).toBe("0185" + "10" + "0100000000000000" + "0200000000000080" + "04deadbeef");
    const state = tiny([{ name: "at", type: { kind: "temporal" } }, { name: "history", type: { kind: "fixed_array", item: { kind: "temporal" }, len: 2 } }]);
    const encoded = encodeSilverRuntimeState(state, "Foo", { at: int(-5), history });
    expect(decodeSilverRuntimeState(state, "Foo", encoded)).toEqual({ at: int(-5), history });
  });

  it("SS-5 a flat state script is upstream's 20{07×32}0805000000000000800101 and decodes back; extra or missing fields are refused", () => {
    const abi = tiny([
      { name: "gen__foo_template", type: { kind: "fixed_bytes", len: 32 } },
      { name: "count", type: { kind: "int" } },
      { name: "flag", type: { kind: "bool" } }
    ]);
    const values = { gen__foo_template: bytes(new Array(32).fill(7)), count: int(-5), flag: { kind: "bool", value: true } as SilArtifactValue };
    const encoded = encodeSilverRuntimeState(abi, "Foo", values);
    expect(encoded).toBe(`20${"07".repeat(32)}0805000000000000800101`);
    expect(decodeSilverRuntimeState(abi, "Foo", encoded)).toEqual(values);
    expect(() => encodeSilverRuntimeState(abi, "Foo", { ...values, extra: int(1) })).toThrow(expect.objectContaining({ code: "SILVER_STATE_INVALID" }));
    expect(() => encodeSilverRuntimeState(abi, "Foo", { count: int(1), flag: values.flag })).toThrow(expect.objectContaining({ code: "SILVER_STATE_INVALID" }));
  });

  it("SS-6 nested structs and an array of structs flatten column by column (upstream round_trips_nested_struct_and_struct_array_runtime_state)", () => {
    const abi = tiny(
      [
        { name: "current", type: { kind: "struct", name: "Outer" } },
        { name: "pairs", type: { kind: "fixed_array", item: { kind: "struct", name: "Pair" }, len: 2 } }
      ],
      {
        Inner: { fields: [{ name: "marker", type: { kind: "byte" } }] },
        Outer: { fields: [{ name: "inner", type: { kind: "struct", name: "Inner" } }, { name: "active", type: { kind: "bool" } }] },
        Pair: { fields: [{ name: "amount", type: { kind: "int" } }, { name: "code", type: { kind: "fixed_bytes", len: 2 } }] }
      }
    );
    const pair = (amount: number, code: number[]): SilArtifactValue => ({ kind: "object", value: { amount: int(amount), code: bytes(code) } });
    const values = {
      current: { kind: "object", value: { inner: { kind: "object", value: { marker: { kind: "byte", value: 7 } } }, active: { kind: "bool", value: true } } } as SilArtifactValue,
      pairs: { kind: "array", value: [pair(11, [0xaa, 0xbb]), pair(12, [0xcc, 0xdd])] } as SilArtifactValue
    };
    const encoded = encodeSilverRuntimeState(abi, "Foo", values);
    expect(encoded).toBe("0107" + "0101" + "10" + "0b00000000000000" + "0c00000000000000" + "04aabbccdd");
    expect(decodeSilverRuntimeState(abi, "Foo", encoded)).toEqual(values);
  });

  it("SS-7 a non-canonical state span is refused (upstream rejects_noncanonical_runtime_state_encodings: OP_PUSHDATA1 for one byte)", () => {
    const abi = tiny([{ name: "value", type: { kind: "byte" } }]);
    expect(decodeSilverRuntimeState(abi, "Foo", "0102")).toEqual({ value: { kind: "byte", value: 2 } });
    expect(() => decodeSilverRuntimeState(abi, "Foo", "4c0102")).toThrow(expect.objectContaining({ code: "SILVER_STATE_NOT_CANONICAL" }));
    expect(() => decodeSilverRuntimeState(abi, "Foo", "52")).toThrow(expect.objectContaining({ code: "SILVER_STATE_INVALID" }));
  });

  it("SS-8 sig-script struct and struct-array arguments (push_sig_arg): a struct pushes its fields; State[] one array per field", () => {
    const abi = tiny(
      [
        { name: "amount", type: { kind: "int" } },
        { name: "owner", type: { kind: "fixed_bytes", len: 2 } }
      ],
      {},
      {
        one: { dispatch_tag: "01020304", params: [{ name: "s", type: { kind: "struct", name: "State" } }] },
        many: { dispatch_tag: "05060708", params: [{ name: "ss", type: { kind: "dynamic_array", item: { kind: "struct", name: "State" } } }] }
      }
    );
    const st = (amount: number, owner: number[]): SilArtifactValue => ({ kind: "object", value: { amount: int(amount), owner: bytes(owner) } });
    // State { amount: 17 (minimal push 0x11), owner: 0xaabb }
    expect(encodeSilverEntryArgs({ artifact: abi, entry: "one", args: [st(17, [0xaa, 0xbb])] })).toBe("0111" + "02aabb" + "0401020304");
    // State[] [{17, aabb}, {-2, ccdd}] → amounts as one int[] push (8-byte items), then owners as one byte[2][] push
    expect(encodeSilverEntryArgs({ artifact: abi, entry: "many", args: [{ kind: "array", value: [st(17, [0xaa, 0xbb]), st(-2, [0xcc, 0xdd])] }] })).toBe(
      "10" + "1100000000000000" + "0200000000000080" + "04aabbccdd" + "0405060708"
    );
    expect(() => encodeSilverEntryArgs({ artifact: abi, entry: "one", args: [{ kind: "object", value: { amount: int(1) } }] })).toThrow(expect.objectContaining({ code: "SILVER_ABI_ARGUMENT_INVALID" }));
    expect(() => encodeSilverEntryArgs({ artifact: abi, entry: "one", args: [{ kind: "object", value: { amount: int(1), owner: bytes([1, 2]), x: int(0) } }] })).toThrow(
      expect.objectContaining({ code: "SILVER_ABI_ARGUMENT_INVALID" })
    );
  });
});

describe("the Silver corpus Counter (silverc v1.0.0 artifacts)", () => {
  const current = parseSilAbiArtifact(json(path.join(COUNTER, "current.artifact.json")));
  const successor = parseSilAbiArtifact(json(path.join(COUNTER, "successor.artifact.json")));

  it("SS-9 its template verifies (canonical state, template hash recomputed) and its state is value = 7", () => {
    const v = verifySilverTemplate(current, "Counter");
    expect(v.state).toEqual({ value: int(7) });
    expect(v.templateHash).toBe(Buffer.from(getSilContract(current, "Counter").contract.compiled.template_hash).toString("hex"));
    expect(verifySilverTemplate(successor, "Counter").state).toEqual({ value: int(12) });
  });

  it("SS-10 the successor value = 12, built from the template alone, is the corpus successor byte for byte (P2SH aa209a21…)", () => {
    const s = silverStateSuccessor(current, "Counter", { value: int(12) });
    expect(s.bytecodeHex).toBe(silContractBytecodeHex(getSilContract(successor, "Counter").contract));
    expect(s.lock.script).toBe("aa209a21b4329548b2d67f62942d65eb32dfd25227d7df7afccb3a5e9bb922e21ac487");
    expect(s.templateHash).toBe(verifySilverTemplate(successor, "Counter").templateHash);
  });

  it("SS-11 a tampered template (a prefix byte changed) is refused: SILVER_ARTIFACT_INCONSISTENT", () => {
    const tampered = JSON.parse(JSON.stringify(json(path.join(COUNTER, "current.artifact.json"))));
    const code = tampered.contracts.Counter.compiled.bytecode as number[];
    code[0] = code[0] ^ 1;
    const artifact = parseSilAbiArtifact(tampered);
    expect(() => verifySilverTemplate(artifact, "Counter")).toThrow(expect.objectContaining({ code: "SILVER_ARTIFACT_INCONSISTENT" }));
    expect(() => silverStateSuccessor(artifact, "Counter", { value: int(12) })).toThrow(expect.objectContaining({ code: "SILVER_ARTIFACT_INCONSISTENT" }));
    expect(silverContractParts(getSilContract(current, "Counter").contract).state).toBe("080700000000000000");
  });
});
