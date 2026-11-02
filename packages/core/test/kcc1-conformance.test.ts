import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  kcc1Hash,
  kcc1Key32,
  kcc1ParseType,
  kcc1TypeName,
  kcc1DispatchTypeName,
  kcc1FunctionSignature,
  kcc1DispatchTag,
  kcc1DispatchTagOfSignature,
  kcc1ParseFunctionSignature,
  kcc1PushMinimal,
  kcc1PushExplicit,
  kcc1Int8,
  kcc1EncodeArguments,
  kcc1DecodeArguments,
  kcc1EncodeState,
  kcc1DecodeState,
  kcc1ValidateType,
  kcc1ValidateEntrypoints,
  kcc1P2shCommitment,
  kcc1P2shScriptPublicKey,
  kcc1SignatureScript,
  kcc1ParseSignatureScript,
  kcc1ReadConsumedState,
  kcc1SplitProgram,
  kcc1TemplateHash,
  kcc1VerifyTemplateHash,
  kcc1TemplateView,
  kcc1ContinuationProgram,
  kcc1Packed,
  kcc1VirtualCommitment,
  kcc1VerifyOpening,
  kcc1ResolveLocation,
  kcc1SharedRoles,
  kcc1RoleOfInput,
  kccBytes,
  kccHex,
  type Kcc1Field,
  type Kcc1Records
} from "../src/index.js";

// -----------------------------------------------------------------------------
// KCC-1 (Final) · every machine-readable conformance vector of kaspanet/kccs@1ed87aef (kcc-0001/vectors/conformance.json,
// authoritative per KCC-0 §5), one test per vector entry, plus HardKAS's own negative tests for the rules the vectors do
// not cover. Canonical level: pure byte computations, no node, no compiler, no runner.
// -----------------------------------------------------------------------------

const FIX = path.join(__dirname, "fixtures", "kcc");
function vectors(file: string, sha256: string): any {
  const bytes = fs.readFileSync(path.join(FIX, file));
  expect(createHash("sha256").update(bytes).digest("hex"), `${file} is the pinned copy`).toBe(sha256);
  return JSON.parse(bytes.toString("utf8"));
}
const V = vectors("kcc-0001-conformance.json", "5a8ae724de9031d3390ded7873df74002ec29a771c5fbc56e1e43d2a9ae26b59");

/** A vector byte string: { hex } or { repeat_hex, count }. */
const byteString = (b: any): Uint8Array =>
  b.hex !== undefined ? kccBytes(b.hex, "vector") : new Uint8Array(b.count).fill(parseInt(b.repeat_hex, 16));
/** An encoding: { hex } or { encoded_prefix_hex, payload: "unchanged" } after the vector's payload. */
const encoding = (e: any, payload: Uint8Array): string => (e.hex !== undefined ? e.hex : e.encoded_prefix_hex + kccHex(payload));

const recordsOf = (v: any): Kcc1Records =>
  Object.fromEntries(
    [...(v.record ? [v.record] : []), ...(v.records ?? [])].map((r: any) => [
      r.name,
      { name: r.name, fields: r.fields.map((f: any) => ({ name: f.name, type: kcc1ParseType(f.type) })) }
    ])
  );

/** Vector record values: a field `x_hex` is field `x` given as hex. */
function valueOf(v: any): any {
  if (Array.isArray(v)) return v.map(valueOf);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/_hex$/, ""), valueOf(x)]));
  return v;
}

const scalarValue = (s: any) => (s.value_decimal !== undefined ? s.value_decimal : s.value_hex !== undefined ? s.value_hex : s.value);

describe("KCC-1 §3.2.1 Hash Function (hash_function)", () => {
  for (const h of V.hash_function) {
    it(h.id, () => {
      const input = kccBytes(h.input_hex, "input");
      if (h.key_hex !== undefined) {
        expect(kccHex(kcc1Key32(kccBytes(h.key_hex, "key")))).toBe(h.key32_hex);
        expect(kccHex(kcc1Hash(input, kccBytes(h.key_hex, "key")))).toBe(h.hash_hex);
      } else {
        expect(kccHex(kcc1Hash(input))).toBe(h.hash_hex);
      }
    });
  }
  it("negative: a key of more than 32 bytes is refused", () => {
    expect(() => kcc1Key32(new Uint8Array(33))).toThrow(/^KCC1_HASH_KEY_TOO_LONG/);
  });
});

describe("KCC-1 §3.4.1 Canonical type names (canonical_type_names)", () => {
  // I-05: each vector's description, as the parsed structure it names (not only the name's round trip)
  const scalar = (name: string) => ({ kind: "scalar", name });
  const EXPECTED: Record<string, unknown> = {
    integer: scalar("int"),
    boolean: scalar("bool"),
    byte: scalar("byte"),
    "UTF-8 string": scalar("string"),
    "32-byte public key": scalar("pubkey"),
    "65-byte transaction signature": scalar("sig"),
    "64-byte data signature": scalar("datasig"),
    "fixed byte string of length 32": { kind: "array", item: scalar("byte"), length: 32 },
    "fixed array of three booleans": { kind: "array", item: scalar("bool"), length: 3 },
    "dynamic array of integers": { kind: "array", item: scalar("int") },
    "record named Transfer": { kind: "record", name: "Transfer" }
  };
  it("every vector's description is one this test maps (a new vector needs its expected structure)", () => {
    expect(V.canonical_type_names.map((t: any) => t.type).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
  for (const t of V.canonical_type_names) {
    it(t.type, () => {
      const parsed = kcc1ParseType(t.type_name);
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(EXPECTED[t.type]);
      expect(kcc1TypeName(parsed)).toBe(t.type_name);
    });
  }
  it("negative: N with a sign, a leading zero or an invalid identifier is not a type name", () => {
    for (const bad of ["byte[01]", "byte[+1]", "byte[-1]", "1int", "int[ 2]", "bool[3][x]"]) expect(() => kcc1ParseType(bad), bad).toThrow(/^KCC1_TYPE_INVALID/);
  });
});

describe("KCC-1 §3.4.2 Data pushes (data_pushes)", () => {
  for (const p of V.data_pushes) {
    it(p.id, () => {
      const payload = byteString(p.payload);
      expect(kccHex(kcc1PushMinimal(payload))).toBe(encoding(p.push_minimal, payload));
      expect(kccHex(kcc1PushExplicit(payload))).toBe(encoding(p.push_explicit, payload));
    });
  }
});

describe("KCC-1 §3.4.3-3.4.4 Scalar encodings (scalar_encodings)", () => {
  for (const s of V.scalar_encodings) {
    it(`${s.type} ${scalarValue(s)}`, () => {
      const value = scalarValue(s);
      expect(kccHex(kcc1EncodeArguments([s.type], [value]))).toBe(s.standalone_argument_hex);
      // the state payload, inside its PushExplicit
      const state = kcc1EncodeState([{ name: "v", type: kcc1ParseType(s.type) }], { v: value });
      expect(kccHex(state)).toBe(kccHex(kcc1PushExplicit(kccBytes(s.state_payload_hex, "payload"))));
      // both decode back to the same bytes
      const [decoded] = kcc1DecodeArguments(s.standalone_argument_hex, [s.type]);
      expect(kccHex(kcc1EncodeArguments([s.type], [decoded]))).toBe(s.standalone_argument_hex);
      expect(kccHex(kcc1EncodeState([{ name: "v", type: kcc1ParseType(s.type) }], kcc1DecodeState(state, [{ name: "v", type: kcc1ParseType(s.type) }]).state))).toBe(kccHex(state));
    });
  }
  it("the int payload is eight-byte little-endian signed magnitude", () => {
    expect(kccHex(kcc1Int8(-5n))).toBe("0500000000000080");
    expect(kccHex(kcc1Int8(0n))).toBe("0000000000000000");
  });
});

describe("KCC-1 §3.4.5-3.4.6 Composite encodings (composite_encodings)", () => {
  for (const c of V.composite_encodings) {
    it(c.id, () => {
      const records = recordsOf(c);
      const type = c.type ?? c.record.name;
      const value = c.value_hex !== undefined ? c.value_hex : valueOf(c.value);
      const combined = c.argument_hex ?? c.combined_hex;
      expect(kccHex(kcc1EncodeArguments([type], [value], records))).toBe(combined);
      if (c.payload_hex !== undefined) {
        // the array payload is what a state field of that type carries
        const state = kcc1EncodeState([{ name: "v", type: kcc1ParseType(type) }], { v: value }, records);
        expect(kccHex(state)).toBe(kccHex(kcc1PushExplicit(kccBytes(c.payload_hex, "payload"))));
      }
      const lowered = c.lowered_argument_hex ?? c.grouped_argument_hex;
      if (lowered) expect(lowered.join("")).toBe(combined);
      const [decoded] = kcc1DecodeArguments(combined, [type], records);
      expect(kccHex(kcc1EncodeArguments([type], [decoded], records))).toBe(combined);
    });
  }
});

describe("KCC-1 §3.5 Dispatch tags and argument encoding", () => {
  const d = V.dispatch_and_arguments;
  it("dispatch_and_arguments", () => {
    const signature = kcc1FunctionSignature(d.entrypoint_name, d.argument_types);
    expect(Buffer.from(signature, "utf8").toString("hex")).toBe(d.function_signature_utf8_hex);
    expect(kcc1DispatchTag(d.entrypoint_name, d.argument_types)).toBe(d.dispatch_tag_hex);
    d.argument_types.forEach((t: string, i: number) => expect(kccHex(kcc1EncodeArguments([t], [d.argument_values[i]]))).toBe(d.argument_encodings_hex[i]));
    expect(kccHex(kcc1EncodeArguments(d.argument_types, d.argument_values))).toBe(d.argument_encodings_hex.join(""));
  });
  const z = V.zero_argument_dispatch;
  it("zero_argument_dispatch", () => {
    expect(Buffer.from(kcc1FunctionSignature(z.entrypoint_name, []), "utf8").toString("hex")).toBe(z.function_signature_utf8_hex);
    expect(kcc1DispatchTag(z.entrypoint_name, [])).toBe(z.dispatch_tag_hex);
    expect(kccHex(kcc1EncodeArguments([], []))).toBe(z.push_arguments_hex);
    expect(`04${kcc1DispatchTag(z.entrypoint_name, [])}`).toBe(z.dispatch_tag_push_hex);
  });
  for (const r of V.record_dispatch) {
    it(`record_dispatch ${r.id}`, () => {
      const records = recordsOf(r);
      expect(r.argument_types.map((t: string) => kcc1DispatchTypeName(t, records))).toEqual(r.dispatch_type_names);
      const signature = kcc1FunctionSignature(r.entrypoint_name, r.argument_types, records);
      expect(Buffer.from(signature, "utf8").toString("hex")).toBe(r.function_signature_utf8_hex);
      expect(kcc1DispatchTagOfSignature(signature)).toBe(r.dispatch_tag_hex);
    });
  }
});

describe("KCC-1 §3.6 P2SH envelope (p2sh_envelope)", () => {
  const p = V.p2sh_envelope;
  const d = V.dispatch_and_arguments;
  it("commitment, script public key and signature script of R = 51", () => {
    const r = kccBytes(p.redeem_script_hex, "R");
    expect(kccHex(kcc1P2shCommitment(r))).toBe(p.blake2b_256_hex);
    expect(kcc1P2shScriptPublicKey(r)).toEqual({ version: p.script_public_key.version, scriptHex: p.script_public_key.script_hex });
    const sig = kcc1SignatureScript(kcc1EncodeArguments(d.argument_types, d.argument_values), kcc1DispatchTag(d.entrypoint_name, d.argument_types), r);
    expect(kccHex(sig)).toBe(p.signature_script_hex);
    const inv = kcc1ParseSignatureScript(p.signature_script_hex, { version: 0, scriptHex: p.script_public_key.script_hex });
    expect(inv.dispatchTagHex).toBe(d.dispatch_tag_hex);
    expect(kccHex(inv.redeemScript)).toBe(p.redeem_script_hex);
    expect(kcc1DecodeArguments(inv.pushArguments, d.argument_types)).toEqual([17n, "01020304", true, 1]);
  });
  it("negative: the envelope is refused when it is not the documented layout", () => {
    // no dispatch tag; a 5-byte tag; a non-push opcode; R not matching the consumed output; a non-canonical push
    expect(() => kcc1ParseSignatureScript("0151")).toThrow(/^KCC1_P2SH_INVALID/);
    expect(() => kcc1ParseSignatureScript("05010203040551")).toThrow(/^KCC1_P2SH_INVALID/);
    expect(() => kcc1ParseSignatureScript("76042c49ed650151")).toThrow(/^KCC1_PUSH_INVALID/);
    expect(() => kcc1ParseSignatureScript(p.signature_script_hex, { version: 0, scriptHex: `aa20${"00".repeat(32)}87` })).toThrow(/^KCC1_P2SH_INVALID/);
    expect(() => kcc1ParseSignatureScript(p.signature_script_hex, { version: 1, scriptHex: p.script_public_key.script_hex })).toThrow(/^KCC1_P2SH_INVALID/);
    expect(() => kcc1ParseSignatureScript("0101042c49ed650151")).toThrow(/^KCC1_PUSH_NONCANONICAL/);
  });
});

describe("KCC-1 §3.7.1 State encoding (state_encoding)", () => {
  const s = V.state_encoding;
  const fields: Kcc1Field[] = s.fields.map((f: any) => ({ name: f.name, type: kcc1ParseType(f.type) }));
  const values = Object.fromEntries(s.fields.map((f: any) => [f.name, f.value_hex ?? f.value]));
  it("each field is PushExplicit of its state payload; the state is their concatenation", () => {
    s.fields.forEach((f: any, i: number) => expect(kccHex(kcc1EncodeState([fields[i]!], { [f.name]: values[f.name] }))).toBe(f.encoded_hex));
    const encoded = kcc1EncodeState(fields, values);
    expect(kccHex(encoded)).toBe(s.encoded_hex);
    expect(encoded.length).toBe(s.encoded_length);
    const decoded = kcc1DecodeState(s.encoded_hex, fields);
    expect(decoded.state).toEqual({ key: s.fields[0].value_hex, label: "Kaspa", counter: -5n, enabled: true });
    expect(decoded.fields.map((f) => [f.path.join("."), f.start, f.end])).toEqual([["key", 0, 33], ["label", 33, 39], ["counter", 39, 48], ["enabled", 48, 50]]);
  });
});

describe("KCC-1 §3.7.3 Template hashes (template_hashes)", () => {
  for (const t of V.template_hashes) {
    it(`prefix '${t.prefix_hex}' suffix '${t.suffix_hex}'`, () => {
      const prefix = kccBytes(t.prefix_hex, "prefix");
      const suffix = kccBytes(t.suffix_hex, "suffix");
      expect(kccHex(kcc1TemplateHash(prefix, suffix))).toBe(t.hash_hex);
      expect(() => kcc1VerifyTemplateHash(prefix, suffix, t.hash_hex)).not.toThrow();
    });
  }
  it("negative: the length fields bind the boundary (61|6263 and 6162|63 differ); a wrong claim is refused", () => {
    expect(kccHex(kcc1TemplateHash(kccBytes("61", "p"), kccBytes("6263", "s")))).not.toBe(kccHex(kcc1TemplateHash(kccBytes("6162", "p"), kccBytes("63", "s"))));
    expect(() => kcc1VerifyTemplateHash(kccBytes("61", "p"), kccBytes("6263", "s"), V.template_hashes[2].hash_hex)).toThrow(/^KCC1_TEMPLATE_HASH_MISMATCH/);
  });
});

describe("KCC-1 §3.7.4 Template views (template_views)", () => {
  const t = V.template_views;
  const R = kccBytes(t.program_hex, "R");
  const fields: Kcc1Field[] = t.fields.map((f: any) => ({ name: f.name, type: kcc1ParseType(f.type) }));
  it("the complete encoded state decodes into the declared fields", () => {
    const split = kcc1SplitProgram(R, t.state_start, t.state_len);
    expect(kccHex(split.encodedState)).toBe(t.fields.map((f: any) => f.encoded_hex).join(""));
  });
  for (const v of t.views) {
    it(`view [${v.fields.join(", ")}]`, () => {
      for (const view of [
        kcc1TemplateView({ redeemScript: R, stateStart: t.state_start, stateLen: t.state_len, fields, fieldNames: v.fields }),
        kcc1TemplateView({ redeemScript: R, stateStart: t.state_start, stateLen: t.state_len, fields, range: { start: v.start, len: v.len } })
      ]) {
        expect([view.start, view.len, kccHex(view.prefix), kccHex(view.encodedState), kccHex(view.suffix), kccHex(view.templateHash)]).toEqual([
          v.start, v.len, v.prefix_hex, v.encoded_state_hex, v.suffix_hex, v.template_hash_hex
        ]);
      }
    });
  }
  it("negative: a view of non-consecutive fields, a range that cuts a field, or one outside the state is refused", () => {
    const base = { redeemScript: R, stateStart: t.state_start, stateLen: t.state_len, fields };
    expect(() => kcc1TemplateView({ ...base, fieldNames: ["a", "c"] })).toThrow(/^KCC1_VIEW_INVALID/);
    expect(() => kcc1TemplateView({ ...base, fieldNames: [] })).toThrow(/^KCC1_VIEW_INVALID/);
    expect(() => kcc1TemplateView({ ...base, range: { start: 2, len: 3 } })).toThrow(/^KCC1_VIEW_INVALID/);
    expect(() => kcc1TemplateView({ ...base, range: { start: 0, len: 4 } })).toThrow(/^KCC1_VIEW_INVALID/);
    expect(() => kcc1SplitProgram(R, 5, 9)).toThrow(/^KCC1_TEMPLATE_INVALID/);
  });
});

describe("KCC-1 §3.7.5 Continuation program (continuation_program)", () => {
  const c = V.continuation_program;
  it("R_next under the b view, its commitment and script public key", () => {
    const encodedNext = kcc1EncodeState([{ name: "b", type: kcc1ParseType("bool") }], c.next_state);
    expect(kccHex(encodedNext)).toBe(c.encoded_next_state_hex);
    const next = kcc1ContinuationProgram(kccBytes(c.prefix_hex, "prefix"), encodedNext, kccBytes(c.suffix_hex, "suffix"));
    expect(kccHex(next.redeemScript)).toBe(c.redeem_script_hex);
    expect(kccHex(next.commitment)).toBe(c.blake2b_256_hex);
    expect(next.scriptPublicKey).toEqual({ version: c.script_public_key.version, scriptHex: c.script_public_key.script_hex });
  });
});

describe("KCC-1 rejection vectors (rejection_vectors): every one is refused", () => {
  it("the file holds the 30 rejection vectors this suite runs", () => {
    expect(V.rejection_vectors.length).toBe(30);
    expect(V.rejection_vectors.every((r: any) => r.expected === "reject")).toBe(true);
  });
  for (const r of V.rejection_vectors) {
    it(`${r.id} (${r.operation}, §${r.rule})`, () => {
      const records = recordsOf(r);
      switch (r.operation) {
        case "encode_scalar":
          expect(() => kcc1EncodeArguments([r.type], [scalarValue(r)])).toThrow(/^KCC1_INT_OUT_OF_RANGE/);
          expect(() => kcc1EncodeState([{ name: "v", type: kcc1ParseType(r.type) }], { v: scalarValue(r) })).toThrow(/^KCC1_INT_OUT_OF_RANGE/);
          break;
        case "decode_arguments":
          expect(() => kcc1DecodeArguments(r.argument_hex, r.argument_types, records)).toThrow(/^KCC1_/);
          break;
        case "decode_state":
          expect(() => kcc1DecodeState(r.encoded_hex, r.fields.map((f: any) => ({ name: f.name, type: kcc1ParseType(f.type) })), records)).toThrow(/^KCC1_/);
          break;
        case "validate_argument_type":
          expect(() => kcc1ValidateType(r.type, records)).toThrow(/^KCC1_TYPE_INVALID/);
          break;
        case "validate_entrypoints": {
          const entrypoints = r.entrypoints.map((e: any) => ({ name: e.name, argumentTypes: e.argument_types }));
          expect(entrypoints.map((e: any) => kcc1FunctionSignature(e.name, e.argumentTypes, records))).toEqual(r.function_signatures);
          expect(r.function_signatures.map(kcc1DispatchTagOfSignature)).toEqual([r.dispatch_tag_hex, r.dispatch_tag_hex]);
          expect(() => kcc1ValidateEntrypoints(entrypoints, records)).toThrow(/^KCC1_DISPATCH_TAG_COLLISION/);
          break;
        }
        default:
          throw new Error(`unknown operation ${r.operation}`);
      }
    });
  }
  it("function signatures in dispatch form parse; record names, whitespace and malformed lists are refused (review L-4)", () => {
    const sigs = [
      Buffer.from(V.dispatch_and_arguments.function_signature_utf8_hex, "hex").toString("utf8"),
      Buffer.from(V.zero_argument_dispatch.function_signature_utf8_hex, "hex").toString("utf8"),
      ...V.record_dispatch.map((r: any) => Buffer.from(r.function_signature_utf8_hex, "hex").toString("utf8")),
      "transfer({int,byte[32],byte,byte,byte[32],byte[32]}[],byte[])",
      "e({})"
    ];
    for (const s of sigs) {
      const p = kcc1ParseFunctionSignature(s);
      expect(`${p.name}(${p.dispatchTypeNames.join(",")})`).toBe(s);
    }
    for (const bad of ["transfer(KCC20State[],byte[])", "x({)", "x(int, bool)", "x(int,)", "x(byte[01])", "1x()", "x(int", "x(int[-1])", "x({int}x)"]) {
      expect(() => kcc1ParseFunctionSignature(bad), bad).toThrow(/^KCC1_TYPE_INVALID/);
    }
  });
  it("negative: a program without entrypoints; distinct tags are accepted", () => {
    expect(() => kcc1ValidateEntrypoints([])).toThrow(/^KCC1_ENTRYPOINTS_EMPTY/);
    expect(kcc1ValidateEntrypoints([{ name: "step", argumentTypes: ["int", "byte[4]", "bool", "byte"] }, { name: "tick", argumentTypes: [] }]).map((e) => e.dispatchTag)).toEqual(["2c49ed65", "161bd7ee"]);
  });
  it("negative: an array of a record with no fields cannot carry its count; a view of such a field selects nothing (review L-3)", () => {
    const records: Kcc1Records = { E: { name: "E", fields: [] } };
    expect(() => kcc1ValidateType("E[]", records)).toThrow(/^KCC1_TYPE_INVALID/);
    expect(() => kcc1ValidateType("E[2]", records)).toThrow(/^KCC1_TYPE_INVALID/);
    expect(() => kcc1ValidateType("E", records)).not.toThrow();
    const fields: Kcc1Field[] = [{ name: "e", type: kcc1ParseType("E") }, { name: "b", type: kcc1ParseType("bool") }];
    const R = Uint8Array.from([0x51, ...kcc1EncodeState(fields, { e: {}, b: true }, records), 0x75]);
    expect(() => kcc1TemplateView({ redeemScript: R, stateStart: 1, stateLen: 2, fields, records, fieldNames: ["e"] })).toThrow(/^KCC1_VIEW_INVALID/);
    expect(kcc1TemplateView({ redeemScript: R, stateStart: 1, stateLen: 2, fields, records, fieldNames: ["b"] }).len).toBe(2);
  });
  it("a byte inside a record array takes the same forms as a standalone byte (review I-3)", () => {
    const records: Kcc1Records = { S: { name: "S", fields: [{ name: "s", type: kcc1ParseType("byte") }] } };
    expect(kccHex(kcc1EncodeArguments(["S[]"], [[{ s: "aa" }, { s: 1 }]], records))).toBe("02aa01");
    expect(kccHex(kcc1EncodeArguments(["byte"], ["aa"]))).toBe("01aa");
    expect(() => kcc1EncodeArguments(["S[]"], [[{ s: "aaa" }]], records)).toThrow(/^KCC1_VALUE_INVALID/);
  });
  it("negative: strings must be valid UTF-8; extra or missing argument pushes are refused", () => {
    expect(() => kcc1DecodeArguments("02c328", ["string"])).toThrow(/^KCC1_DECODE_INVALID/);
    expect(() => kcc1DecodeArguments("011151", ["int"])).toThrow(/^KCC1_DECODE_INVALID/);
    expect(() => kcc1DecodeArguments("0111", ["int", "bool"])).toThrow(/^KCC1_DECODE_INVALID/);
  });
});

describe("KCC-1 §3.9.1 Hash-committed virtual element (hash_committed_virtual_element)", () => {
  const h = V.hash_committed_virtual_element;
  it("Packed(value) and its commitment; an opening is verified before use", () => {
    const payload = kcc1Packed(h.record.fields.map((f: any) => ({ type: f.type, value: f.value })));
    expect(kccHex(payload)).toBe(h.packed_hex);
    expect(kccHex(kcc1VirtualCommitment(payload))).toBe(h.commitment_hex);
    expect(kcc1VerifyOpening(payload, kccBytes(h.commitment_hex, "c"))).toBe(true);
    const tampered = Uint8Array.from(payload);
    tampered[0] = 0x06;
    expect(kcc1VerifyOpening(tampered, kccBytes(h.commitment_hex, "c"))).toBe(false);
  });
  it("negative: Packed needs a statically known width", () => {
    expect(() => kcc1Packed([{ type: "string", value: "x" }])).toThrow(/^KCC1_PACKED_NOT_FIXED/);
    expect(() => kcc1Packed([{ type: "int[]", value: [1n] }])).toThrow(/^KCC1_PACKED_NOT_FIXED/);
  });
});

describe("KCC-1 §3.4.7 Value locations, §3.7.2 reading consumed state, §3.8.1 roles (HardKAS tests; no vectors)", () => {
  const fields: Kcc1Field[] = [{ name: "example_state_values", type: kcc1ParseType("int[4]") }];
  const encoded = kcc1EncodeState(fields, { example_state_values: [7n, 8n, 9n, 10n] });
  it("state.example_state_values[0] resolves after decoding; a missing field or index is invalid", () => {
    const { state } = kcc1DecodeState(encoded, fields);
    expect(kcc1ResolveLocation(state, fields, [{ field: "example_state_values" }, { index: 0 }])).toBe(7n);
    expect(kcc1ResolveLocation(state, fields, [])).toBe(state);
    expect(() => kcc1ResolveLocation(state, fields, [{ field: "nope" }])).toThrow(/^KCC1_LOCATION_INVALID/);
    expect(() => kcc1ResolveLocation(state, fields, [{ field: "example_state_values" }, { index: 4 }])).toThrow(/^KCC1_LOCATION_INVALID/);
  });
  it("locations follow the types: a byte string is indexable, a pubkey or a string is not (review L-2)", () => {
    const layout: Kcc1Field[] = [
      { name: "key", type: kcc1ParseType("pubkey") },
      { name: "id", type: kcc1ParseType("byte[2]") },
      { name: "label", type: kcc1ParseType("string") },
      { name: "p", type: kcc1ParseType("Pair") }
    ];
    const records: Kcc1Records = { Pair: { name: "Pair", fields: [{ name: "count", type: kcc1ParseType("int") }, { name: "enabled", type: kcc1ParseType("bool") }] } };
    const value = { key: "07".repeat(32), id: "aabb", label: "abcd", p: { count: 17n, enabled: true } };
    expect(kcc1ResolveLocation(value, layout, [{ field: "id" }, { index: 1 }], records)).toBe(0xbb);
    expect(kcc1ResolveLocation(value, layout, [{ field: "p" }, { field: "count" }], records)).toBe(17n);
    expect(() => kcc1ResolveLocation(value, layout, [{ field: "key" }, { index: 0 }], records)).toThrow(/^KCC1_LOCATION_INVALID/);
    expect(() => kcc1ResolveLocation(value, layout, [{ field: "label" }, { index: 0 }], records)).toThrow(/^KCC1_LOCATION_INVALID/);
    expect(() => kcc1ResolveLocation(value, layout, [{ field: "p" }, { index: 0 }], records)).toThrow(/^KCC1_LOCATION_INVALID/);
    expect(() => kcc1ResolveLocation(value, layout, [{ index: 0 }], records)).toThrow(/^KCC1_LOCATION_INVALID/);
  });
  it("strings: a leading U+FEFF is kept (review M-1); a lone surrogate has no UTF-8 encoding (review L-1)", () => {
    expect(kcc1DecodeArguments("04efbbbf41", ["string"])).toEqual(["﻿A"]);
    const st = [{ name: "s", type: kcc1ParseType("string") }];
    expect(kcc1DecodeState("04efbbbf41", st).state).toEqual({ s: "﻿A" });
    expect(() => kcc1EncodeArguments(["string"], ["\uD800"])).toThrow(/^KCC1_VALUE_INVALID/);
    expect(() => kcc1EncodeState(st, { s: "a\uDC00" })).toThrow(/^KCC1_VALUE_INVALID/);
    expect(kccHex(kcc1EncodeArguments(["string"], ["😀"]))).toBe("04f09f9880");
  });
  it("the consumed state is read from R after the envelope and the bounds are checked", () => {
    const prefix = kccBytes("6b", "p");
    const suffix = kccBytes("75", "s");
    const R = new Uint8Array([...prefix, ...encoded, ...suffix]);
    const sig = kcc1SignatureScript(new Uint8Array(0), "161bd7ee", R);
    const read = kcc1ReadConsumedState({ signatureScript: sig, consumed: kcc1P2shScriptPublicKey(R), stateStart: 1, stateLen: encoded.length, fields });
    expect(read.state).toEqual({ example_state_values: [7n, 8n, 9n, 10n] });
    expect(() => kcc1ReadConsumedState({ signatureScript: sig, consumed: kcc1P2shScriptPublicKey(prefix), stateStart: 1, stateLen: encoded.length, fields })).toThrow(/^KCC1_P2SH_INVALID/);
    expect(() => kcc1ReadConsumedState({ signatureScript: sig, stateStart: 1, stateLen: encoded.length + 2, fields })).toThrow(/^KCC1_TEMPLATE_INVALID/);
    expect(() => kcc1ReadConsumedState({ signatureScript: sig, stateStart: 2, stateLen: encoded.length - 1, fields })).toThrow(/^KCC1_/);
  });
  it("the leader is the lowest-indexed input carrying the Covenant ID; later ones are delegators", () => {
    const A = "aa".repeat(32);
    const B = "bb".repeat(32);
    const ids = [null, B, A, A, B, A];
    expect(kcc1SharedRoles(ids, A)).toEqual({ leader: 2, delegators: [3, 5] });
    expect(kcc1SharedRoles(ids, B)).toEqual({ leader: 1, delegators: [4] });
    expect(kcc1SharedRoles(ids, "cc".repeat(32))).toBeUndefined();
    expect([0, 1, 2, 3].map((i) => kcc1RoleOfInput(ids, i))).toEqual([undefined, "leader", "leader", "delegator"]);
  });
});
