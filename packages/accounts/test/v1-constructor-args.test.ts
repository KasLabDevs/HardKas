import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadManagedKaspaWasmSync, serializeSilArtifactValues, type SilArtifactValue } from "@hardkas/core";
import { resolveV1ConstructorArgs } from "../src/index.js";

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · constructor arguments, proven. A compile record keeps only their digest; the engine needs the values. Given
// ones must match the digest; otherwise they are assembled from what the operation names (a signature slot's signer key
// for the key parameter the slot is checked against; the initial State of the record's artifact for a parameter that
// initializes a field) and kept only when their digest is the record's. Real silverc artifacts (fixtures), no compiler.
// -----------------------------------------------------------------------------

const F = path.join(__dirname, "fixtures", "v1-engine");
const COUNTER = path.join(__dirname, "..", "..", "..", "fixtures", "toccata-v2", "silver", "covenant-counter-transition");
const json = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const recordOf = (artifactPath: string, ctor: SilArtifactValue[]) => ({ provenance: { constructorArgsSha256: sha(serializeSilArtifactValues(ctor)), artifactSha256: "" }, artifactJson: fs.readFileSync(artifactPath, "utf8") });
const code = (f: () => unknown) => {
  try {
    f();
    return "OK";
  } catch (e: any) {
    return e?.code ?? `UNCODED ${e?.message}`;
  }
};

let k: any;
const xonly = (key: string) => String(new k.PrivateKey(key).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
const bytes = (hex: string): SilArtifactValue => ({ kind: "bytes", value: Uint8Array.from(Buffer.from(hex, "hex")) });

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
});

describe("V1-ENGINE-2 · resolveV1ConstructorArgs", () => {
  it("CA-1 given arguments: kept when their digest is the record's, SILVER_CONSTRUCTOR_ARGS_MISMATCH otherwise", () => {
    const alice = xonly("11".repeat(32));
    const bob = xonly("22".repeat(32));
    const ctor = [bytes(alice), bytes(bob)];
    const record = recordOf(path.join(F, "phase2", "twooftwo.artifact.json"), ctor);
    const ast = json(path.join(F, "phase2", "twooftwo.ast.json"));
    expect(resolveV1ConstructorArgs({ record, contractName: "TwoOfTwo", ast, explicit: ctor }).source).toBe("given");
    expect(code(() => resolveV1ConstructorArgs({ record, contractName: "TwoOfTwo", ast, explicit: [bytes(bob), bytes(alice)] }))).toBe("SILVER_CONSTRUCTOR_ARGS_MISMATCH");
  });

  it("CA-2 from the signers of the called entry (TwoOfTwo.spend: sa ↔ a, sb ↔ b): derived and proven; signers swapped: SIGNER_SLOT_KEY_MISMATCH; one signer missing: SILVER_CONSTRUCTOR_ARGS_REQUIRED", () => {
    const alice = xonly("11".repeat(32));
    const bob = xonly("22".repeat(32));
    const record = recordOf(path.join(F, "phase2", "twooftwo.artifact.json"), [bytes(alice), bytes(bob)]);
    const ast = json(path.join(F, "phase2", "twooftwo.ast.json"));
    const r = resolveV1ConstructorArgs({ record, contractName: "TwoOfTwo", ast, slots: { functionName: "spend", signers: { sa: alice, sb: bob } } });
    expect(r.source).toBe("derived");
    expect(r.constructorArgs.map((a: any) => Buffer.from(a.value).toString("hex"))).toEqual([alice, bob]);
    expect(code(() => resolveV1ConstructorArgs({ record, contractName: "TwoOfTwo", ast, slots: { functionName: "spend", signers: { sa: bob, sb: alice } } }))).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(code(() => resolveV1ConstructorArgs({ record, contractName: "TwoOfTwo", ast, slots: { functionName: "spend", signers: { sa: alice } } }))).toBe("SILVER_CONSTRUCTOR_ARGS_REQUIRED");
  });

  it("CA-3 from the initial State: the corpus Counter (init_value → value = 7) and a two-field Matrix (init_amount, init_owner) are derived and proven", () => {
    const counter = resolveV1ConstructorArgs({
      record: recordOf(path.join(COUNTER, "current.artifact.json"), [{ kind: "int", value: 7n }]),
      contractName: "Counter",
      ast: json(path.join(F, "counter.ast.json"))
    });
    expect([counter.source, counter.constructorArgs]).toEqual(["derived", [{ kind: "int", value: 7n }]]);
    const owner = { kind: "bytes", value: Uint8Array.from(new Array(32).fill(7)) } as SilArtifactValue;
    const matrix = resolveV1ConstructorArgs({
      record: recordOf(path.join(F, "phase2", "implicitto.artifact.json"), [{ kind: "int", value: 100n }, owner]),
      contractName: "Matrix",
      ast: json(path.join(F, "phase2", "implicitto.ast.json"))
    });
    expect(matrix.source).toBe("derived");
    expect(matrix.derived).toHaveLength(2);
  });

  it("CA-4 a parameter nothing fills (Matrix's max_ins, max_outs: bounds, not State, not keys): SILVER_CONSTRUCTOR_ARGS_REQUIRED — never a guess", () => {
    const owner = { kind: "bytes", value: Uint8Array.from(new Array(32).fill(7)) } as SilArtifactValue;
    const record = recordOf(path.join(F, "phase2", "matrix.artifact.json"), [{ kind: "int", value: 2n }, { kind: "int", value: 2n }, { kind: "int", value: 100n }, owner]);
    expect(code(() => resolveV1ConstructorArgs({ record, contractName: "Matrix", ast: json(path.join(F, "phase2", "matrix.ast.json")) }))).toBe("SILVER_CONSTRUCTOR_ARGS_REQUIRED");
  });
});
