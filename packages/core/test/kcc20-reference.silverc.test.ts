import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  compileSilverScript,
  encodeSilverEntryArgs,
  encodeSilverRuntimeState,
  parseSilAbiArtifact,
  kcc1EncodeState,
  kcc1SilverDispatchTags,
  kcc1TemplateHash,
  kcc20Entrypoints,
  kcc20EncodeState,
  kcc20ParseArtifact,
  kcc20SilverProgramState,
  kcc20SilverStateLayout,
  kcc20State,
  kcc20BorrowWitness,
  kcc20TransferArguments,
  kcc20TransferWitness,
  kccBytes,
  kccHex,
  type SilAbiArtifact,
  type SilArtifactValue
} from "../src/index.js";

// -----------------------------------------------------------------------------
// KCC-20 interoperability with its linked reference implementation (argent-lang/kcc20-reference @ 27f8403f, the
// implementation KCC-20's Final PR #41 links; ISC licensed, so it is read from a pinned local copy, never vendored):
// - its vector snapshot is the KCC-20 vector file HardKAS runs;
// - its kcc20.json program artifact reads as the default configuration;
// - its compiled ABI (silverc, as argentc embeds it) has the KCC-1 dispatch tags HardKAS computes for every entry;
// - HardKAS's pinned silverc v1.0.0 compiles its KCC20.sil to the same bytecode, state span and template hash;
// - a program's KCC20State is the KCC-1 template view of its last six state fields (the reference keeps its own
//   template commitment first: 145 state bytes, 112 of them KCC20State);
// - HardKAS's SDK-based SilverScript invocation encoder and its KCC-1 encoder produce the same transfer invocation.
// silverc level (the pinned silverc); HARDKAS_TEST_KCC20_REFERENCE names the reference checkout. Without it the suite
// FAILS (KCC20_REFERENCE_MISSING), never passes by omission; HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 skips it explicitly.
// -----------------------------------------------------------------------------

const REF = process.env.HARDKAS_TEST_KCC20_REFERENCE ?? "";
const SKIP_REF = process.env.HARDKAS_TEST_SKIP_KCC20_REFERENCE === "1";
const PINNED: Record<string, string> = {
  "fixtures/kcc20/conformance.json": "9b424c96ea0e0093cacfd98e3013fd5cbf93dd149cb27696acf288510133010b",
  "fixtures/public-mint/artifact.json": "b5f93220b005f39ece92347f5226b2dd4b2f8f8c65b38b359c95133fdcf1c41e",
  "fixtures/public-mint/kcc20.json": "dac7b9f25155a187771a554b1a2ffc4cd50980ce015577e29a5cf964e53a3439",
  "fixtures/public-mint/sil/KCC20.sil": "9c61d62a1b90ad541bbf5c48ec53faaff1826cbc6f26bd42fa429df5c295316c"
};
// a checkout made with core.autocrlf=true converts the reference's line endings: it fails the digest check, by name
const crlfNote = (b: Buffer) => (b.includes("\r\n") ? " (its line endings were converted to CRLF: check the reference out with core.autocrlf=false)" : "");
const read = (rel: string): Buffer => {
  const b = fs.readFileSync(path.join(REF, rel));
  expect(createHash("sha256").update(b).digest("hex"), `${rel} is the pinned reference file${crlfNote(b)}`).toBe(PINNED[rel]);
  return b;
};
const zeros = (n: number) => new Array(n).fill(0);

describe.skipIf(SKIP_REF)("KCC-20 · the linked reference implementation (argent-lang/kcc20-reference @ 27f8403f)", () => {
  let reference: SilAbiArtifact;
  beforeAll(() => {
    if (REF === "") {
      throw new Error(
        "KCC20_REFERENCE_MISSING: set HARDKAS_TEST_KCC20_REFERENCE to a checkout of argent-lang/kcc20-reference @ 27f8403f " +
          "(or HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 to skip this suite explicitly)"
      );
    }
    reference = parseSilAbiArtifact(JSON.parse(read("fixtures/public-mint/artifact.json").toString("utf8")).sil_abi);
  });

  it("X1 its vector snapshot is byte-identical to the KCC-20 vectors HardKAS runs", () => {
    const official = fs.readFileSync(path.join(__dirname, "fixtures", "kcc", "kcc-0020-conformance.json"));
    expect(read("fixtures/kcc20/conformance.json").equals(official)).toBe(true);
  });

  it("X2 its kcc20.json program artifact reads as the default KCC-20 configuration", () => {
    const cfg = kcc20ParseArtifact(JSON.parse(read("fixtures/public-mint/kcc20.json").toString("utf8")));
    expect(cfg).toMatchObject({ transferEntrypoint: "transfer", delegatorEntrypoint: "transfer_delegator", ownerSchemes: [0, 1, 2, 3, 4], maxTokenInputs: 3, maxTokenOutputs: 3, programArtifact: "artifact.json" });
  });

  it("X3 every entry of its compiled contracts has the KCC-1 dispatch tag HardKAS computes; KCC20's are 79c71c23 and fd3ef14a", () => {
    for (const name of Object.keys(reference.contracts)) {
      for (const e of kcc1SilverDispatchTags(reference, name)) expect(e.matches, `${name}.${e.entry}: ${e.functionSignature}`).toBe(true);
    }
    const tags = Object.fromEntries(kcc1SilverDispatchTags(reference, "KCC20").map((e) => [e.entry, e.dispatchTag]));
    expect(tags).toEqual({ transfer: kcc20Entrypoints().transfer.dispatchTag, transfer_delegator: kcc20Entrypoints().delegator.dispatchTag });
    expect(Object.values(tags)).toEqual(["79c71c23", "fd3ef14a"]);
  });

  it("X4 HardKAS's pinned silverc v1.0.0 compiles KCC20.sil to the reference's bytecode, state span and template hash", async () => {
    const source = read("fixtures/public-mint/sil/KCC20.sil").toString("utf8");
    const ctor: SilArtifactValue[] = [
      { kind: "bytes", value: zeros(32) },
      { kind: "int", value: 0n },
      { kind: "bytes", value: zeros(32) },
      { kind: "byte", value: 0 },
      { kind: "byte", value: 0 },
      { kind: "bytes", value: zeros(32) },
      { kind: "bytes", value: zeros(32) }
    ];
    const ours = (await compileSilverScript({ source, constructorArgs: ctor })).artifact.contracts.KCC20!;
    const theirs = reference.contracts.KCC20!;
    expect(ours.compiled.state_span).toEqual(theirs.compiled.state_span);
    expect(kccHex(Uint8Array.from(ours.compiled.template_hash))).toBe(kccHex(Uint8Array.from(theirs.compiled.template_hash)));
    expect(Buffer.from(ours.compiled.bytecode).equals(Buffer.from(theirs.compiled.bytecode))).toBe(true);
    expect(JSON.stringify(ours.entries)).toBe(JSON.stringify(theirs.entries));
  });

  it("X5 a program's KCC20State is the KCC-1 template view of its last six fields; both state encoders agree", () => {
    const contract = reference.contracts.KCC20!;
    const layout = kcc20SilverStateLayout(reference, "KCC20");
    expect([layout.stateStart, layout.stateLen]).toEqual([1, 145]);
    const bytecode = Uint8Array.from(contract.compiled.bytecode);
    const prefix = bytecode.slice(0, layout.stateStart);
    const suffix = bytecode.slice(layout.stateStart + layout.stateLen);
    // the reference keeps the template hash of its own (prefix, suffix) as the first state field
    expect(kccHex(kcc1TemplateHash(prefix, suffix))).toBe(kccHex(Uint8Array.from(contract.compiled.template_hash)));
    const state = kcc20State({ amount: 1000n, owner: "11".repeat(32), ownerScheme: 1, borrowScheme: 1, borrowGuard: `f401000000000000${"00".repeat(24)}`, extensionCommitment: "00".repeat(32) });
    const full = {
      gen__kcc20_template: kccHex(Uint8Array.from(contract.compiled.template_hash)),
      amount: state.amount,
      owner: state.owner,
      owner_scheme: state.ownerScheme,
      borrow_scheme: state.borrowScheme,
      borrow_guard: state.borrowGuard,
      extension_commitment: state.extensionCommitment
    };
    const encoded = kcc1EncodeState(layout.fields, full, layout.records);
    expect(encoded.length).toBe(145);
    // the SilverScript runtime-state encoder (silverscript-abi rules) writes the same bytes
    const silverValues: Record<string, SilArtifactValue> = {
      gen__kcc20_template: { kind: "bytes", value: [...contract.compiled.template_hash] },
      amount: { kind: "int", value: 1000n },
      owner: { kind: "bytes", value: [...kccBytes(state.owner, "o")] },
      owner_scheme: { kind: "byte", value: 1 },
      borrow_scheme: { kind: "byte", value: 1 },
      borrow_guard: { kind: "bytes", value: [...kccBytes(state.borrowGuard, "g")] },
      extension_commitment: { kind: "bytes", value: zeros(32) }
    };
    expect(encodeSilverRuntimeState(reference, "KCC20", silverValues)).toBe(kccHex(encoded));
    const R = Uint8Array.from([...prefix, ...encoded, ...suffix]);
    const read = kcc20SilverProgramState(reference, "KCC20", R);
    expect(read.state).toEqual(state);
    expect(kccHex(read.view.encodedState)).toBe(kccHex(kcc20EncodeState(state)));
    expect([read.view.start, read.view.len]).toEqual([1 + 33, 112]);
  });

  it("X6 the SDK-based SilverScript encoder and the KCC-1 encoder write the same transfer invocation", () => {
    const states = [
      kcc20State({ amount: 600n, owner: "22".repeat(32), ownerScheme: 0, borrowScheme: 0, borrowGuard: "00".repeat(32), extensionCommitment: "00".repeat(32) }),
      kcc20State({ amount: 400n, owner: "33".repeat(32), ownerScheme: 1, borrowScheme: 1, borrowGuard: "00".repeat(32), extensionCommitment: "00".repeat(32) })
    ];
    for (const [label, witness] of [
      ["p2pk", kcc20TransferWitness({ scheme: 0x00, signature: "44".repeat(65) })],
      ["covenant-id (one-byte witness 00)", kcc20TransferWitness({ scheme: 0x04 })],
      ["p2sh index 1 (witness 0001)", kcc20TransferWitness({ scheme: 0x03, inputIndex: 1 })],
      ["amount-threshold borrow (one-byte witness 01: PushMinimal is OP_1)", kcc20BorrowWitness({ scheme: 0x01 })]
    ] as const) {
      const sdk = encodeSilverEntryArgs({
        artifact: reference,
        contractName: "KCC20",
        entry: "transfer",
        args: [
          {
            kind: "array",
            value: states.map((s) => ({
              kind: "object" as const,
              value: {
                amount: { kind: "int" as const, value: s.amount },
                owner: { kind: "bytes" as const, value: [...kccBytes(s.owner, "o")] },
                owner_scheme: { kind: "byte" as const, value: s.ownerScheme },
                borrow_scheme: { kind: "byte" as const, value: s.borrowScheme },
                borrow_guard: { kind: "bytes" as const, value: [...kccBytes(s.borrowGuard, "g")] },
                extension_commitment: { kind: "bytes" as const, value: [...kccBytes(s.extensionCommitment, "e")] }
              }
            }))
          },
          { kind: "bytes", value: [...witness] }
        ]
      });
      expect(sdk, label).toBe(kccHex(kcc20TransferArguments(states, witness)) + "04" + kcc20Entrypoints().transfer.dispatchTag);
    }
  });
});
