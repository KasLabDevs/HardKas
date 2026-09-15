import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blake2b } from "@noble/hashes/blake2.js";
import {
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  parseSilAbiArtifact,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  silverSigFromInputSignature,
  silverUnlockScript,
  type SilArtifactValue
} from "../src/index.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "silverscript-v1");
const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(FIXTURES, "abi-vectors.artifact.json"), "utf8")));
const { contract } = getSilContract(artifact);
const bytecode = silContractBytecodeHex(contract);
const vectors = JSON.parse(fs.readFileSync(path.join(FIXTURES, "abi-vectors.vectors.json"), "utf8")).vectors as Array<{
  entry: string;
  args: any[];
  expectedHex?: string;
  upstreamError?: string;
}>;

const fromFixture = (v: any): SilArtifactValue =>
  v.kind === "int" ? { kind: "int", value: BigInt(v.value) } : v.kind === "array" ? { kind: "array", value: v.value.map(fromFixture) } : v;

const isScalarEntry = (entry: string) =>
  contract.entries[entry]!.params.every((p) => !["fixed_array", "dynamic_array", "struct"].includes(p.type.kind));

/** Kaspa data push of `hex` (OP_DATA_n / OP_PUSHDATA1 / OP_PUSHDATA2), as a test-side reference. */
function push(hex: string): string {
  const n = hex.length / 2;
  if (n < 76) return n.toString(16).padStart(2, "0") + hex;
  if (n < 256) return "4c" + n.toString(16).padStart(2, "0") + hex;
  return "4d" + Buffer.from([n & 0xff, n >> 8]).toString("hex") + hex;
}

describe("SilverScript entry encoding vs upstream silverscript-abi (differential)", () => {
  it("covers every scalar type and the push-size boundaries", () => {
    expect(vectors.length).toBe(30);
    const kinds = new Set(vectors.flatMap((v) => contract.entries[v.entry]!.params.map((p) => p.type.kind)));
    expect([...kinds].sort()).toEqual(["bool", "byte", "bytes", "datasig", "dynamic_array", "fixed_bytes", "int", "pubkey", "sig", "string", "temporal"]);
  });

  for (const [i, v] of vectors.entries()) {
    if (!isScalarEntry(v.entry)) continue;
    it(`vector ${i}: ${v.entry} matches upstream byte for byte`, () => {
      expect(v.expectedHex).toBeDefined();
      expect(encodeSilverEntryArgs({ artifact, entry: v.entry, args: v.args.map(fromFixture) })).toBe(v.expectedHex);
    });
  }

  it("is NOT_IMPLEMENTED where upstream uses its own array/struct encoding", () => {
    const listVectors = vectors.filter((v) => !isScalarEntry(v.entry));
    expect(listVectors.length).toBeGreaterThan(0);
    for (const v of listVectors) {
      expect(v.expectedHex).toBeDefined(); // upstream encodes it...
      expect(() => encodeSilverEntryArgs({ artifact, entry: v.entry, args: v.args.map(fromFixture) })).toThrow(
        expect.objectContaining({ code: "SILVER_ABI_NOT_IMPLEMENTED" }) // ...HardKAS does not reimplement it
      );
    }
  });

  it("rejects calls that do not fit the entry", () => {
    const sig65: SilArtifactValue = { kind: "bytes", value: new Array(65).fill(1) };
    const pk: SilArtifactValue = { kind: "bytes", value: new Array(32).fill(2) };
    const ds: SilArtifactValue = { kind: "bytes", value: new Array(64).fill(3) };
    const digest: SilArtifactValue = { kind: "bytes", value: new Array(32).fill(4) };
    expect(() => encodeSilverEntryArgs({ artifact, entry: "nope", args: [] })).toThrow(expect.objectContaining({ code: "SILVER_ABI_UNKNOWN_ENTRY" }));
    const invalid = [
      { entry: "timed", args: [] },
      { entry: "timed", args: [{ kind: "bool", value: true }] },
      { entry: "timed", args: [{ kind: "int", value: -(2n ** 63n) }] },
      { entry: "timed", args: [{ kind: "int", value: 2 ** 60 }] },
      { entry: "keys", args: [pk, { kind: "bytes", value: new Array(64).fill(1) }, ds, digest] },
      { entry: "keys", args: [pk, sig65, ds, { kind: "bytes", value: new Array(31).fill(4) }] }
    ] as const;
    for (const call of invalid) {
      expect(() => encodeSilverEntryArgs({ artifact, entry: call.entry, args: call.args as any }), JSON.stringify(call.args, (_, x) => (typeof x === "bigint" ? x.toString() : x))).toThrow(
        expect.objectContaining({ code: "SILVER_ABI_ARGUMENT_INVALID" })
      );
    }
    expect(encodeSilverEntryArgs({ artifact, entry: "keys", args: [pk, sig65, ds, digest] })).toMatch(/949a1e6f$/);
  });
});

describe("SilverScript P2SH lock and unlock (SDK)", () => {
  it("locks to OP_BLAKE2B <blake2b-256(bytecode)> OP_EQUAL", () => {
    const hash = Buffer.from(blake2b(Buffer.from(bytecode, "hex"), { dkLen: 32 })).toString("hex");
    expect(silverP2shLock(bytecode)).toEqual({ version: 0, script: `aa20${hash}87` });
  });

  it("derives a script-hash address on the requested network", () => {
    expect(silverP2shAddress(bytecode, "simnet")).toMatch(/^kaspasim:p/);
    expect(silverP2shAddress(bytecode, "testnet-10")).toMatch(/^kaspatest:p/);
  });

  it("unlocks with the entry arguments followed by the pushed redeem script", () => {
    const args = encodeSilverEntryArgs({ artifact, entry: "timed", args: [{ kind: "int", value: 0n }] });
    expect(silverUnlockScript(bytecode, args)).toBe(args + push(bytecode));
  });

  it("takes the 65-byte sig out of an SDK input signature", () => {
    const k = loadManagedKaspaWasmSync();
    const key = new k.PrivateKey("11".repeat(32));
    const spk = silverP2shLock(bytecode);
    const txid = "ab".repeat(32);
    const tx = new k.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: { transactionId: txid, index: 0 },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1,
          utxo: {
            outpoint: { transactionId: txid, index: 0 },
            amount: 100_000_000n,
            scriptPublicKey: new k.ScriptPublicKey(spk.version, spk.script),
            blockDaaScore: 0n,
            isCoinbase: false
          }
        }
      ],
      outputs: [{ value: 99_000_000n, scriptPublicKey: new k.ScriptPublicKey(spk.version, spk.script) }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    const inputSignature = String(k.createInputSignature(tx, 0, key, k.SighashType.All));
    const sig = silverSigFromInputSignature(inputSignature);
    expect(sig.length).toBe(65);
    expect(sig[64]).toBe(1); // SIGHASH_ALL
    expect(Buffer.from(sig).toString("hex")).toBe(inputSignature.slice(2));

    expect(() => silverSigFromInputSignature("00" + inputSignature.slice(2))).toThrow(expect.objectContaining({ code: "SILVER_ABI_SIGNATURE_INVALID" }));
    expect(() => silverSigFromInputSignature(inputSignature.slice(0, -2))).toThrow(expect.objectContaining({ code: "SILVER_ABI_SIGNATURE_INVALID" }));
  });
});
