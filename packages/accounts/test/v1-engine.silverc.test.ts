import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { compileSilverScript, loadManagedKaspaWasmSync, parseSilverSourceAst, serializeSilArtifactValues, systemRuntimeContext, type SilArtifactValue } from "@hardkas/core";
import { createV1TxPlanArtifact } from "@hardkas/artifacts";
import { v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import { buildV1Transaction, gatherV1ContractFacts, gatherV1SuccessorFacts, v1ArgToSil, type SilverCompileRecordLike } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// F1.4 part 1 + F1.5 with the pinned silverc v1.0.0 (silverc level: HARDKAS_HOME holds the compiler). The contract facts
// are what silverc reproduces, never what a plan says: the corpus Counter record is reproduced byte for byte, its successor
// (7 → 12) is the corpus's, a record silverc does not reproduce or other constructor arguments are refused, and a signed
// contract compiled for a throwaway key is spent by the engine with that key in its signature slot. No network.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const CORPUS = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "covenant-counter-transition");
const sha = (s: string | Uint8Array) => crypto.createHash("sha256").update(s).digest("hex");
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-10-26T00:00:00.000Z") } } as any;
const COUNTER_SRC = fs.readFileSync(path.join(CORPUS, "current.sil"), "utf8");
const SEVEN: SilArtifactValue[] = [{ kind: "int", value: 7n }];

/** A sealed-record stand-in: what `hardkas silver compile` records for this source and arguments. */
async function recordOf(source: string, args: SilArtifactValue[], contentHash: string): Promise<SilverCompileRecordLike> {
  const c = await compileSilverScript({ source, constructorArgs: args });
  return {
    contentHash,
    source: { text: source, sha256: sha(source) },
    provenance: { artifactSha256: c.provenance.artifactSha256, constructorArgsSha256: sha(serializeSilArtifactValues(args)) },
    artifactJson: Buffer.from(c.artifactBytes).toString("utf8")
  };
}

let k: any;
let counterRecord: SilverCompileRecordLike;
beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  counterRecord = await recordOf(COUNTER_SRC, SEVEN, "a".repeat(64));
});

describe("F1.4 · contract facts are what silverc reproduces", () => {
  it("S-1 the corpus Counter record is reproduced: the corpus artifact digest, its P2SH, the 1:1 auth transition declaration", async () => {
    const f = await gatherV1ContractFacts({ record: counterRecord, contractName: "Counter", constructorArgs: SEVEN });
    expect(f.artifactSha256).toBe("e72250b3be50bb0f7f54b1a51e1ff6ba2aa6f5be6de6a91d584c519df930aef3");
    expect(f.lock.script).toBe("aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87");
    expect(f.declarations).toEqual([{ policy: "bump", form: "covenant", binding: "auth", from: 1, to: 1, mode: "transition" }]);
  });

  it("S-2 a record silverc does not reproduce is refused (SILVER_RECORD_NOT_REPRODUCED); other constructor arguments too (SILVER_CONSTRUCTOR_ARGS_MISMATCH)", async () => {
    const tampered = { ...counterRecord, artifactJson: counterRecord.artifactJson.replace('"Counter"', '"Counter2"') };
    await expect(gatherV1ContractFacts({ record: tampered, contractName: "Counter", constructorArgs: SEVEN })).rejects.toMatchObject({ code: "SILVER_RECORD_NOT_REPRODUCED" });
    await expect(gatherV1ContractFacts({ record: counterRecord, contractName: "Counter", constructorArgs: [{ kind: "int", value: 8n }] })).rejects.toMatchObject({ code: "SILVER_CONSTRUCTOR_ARGS_MISMATCH" });
  });

  it("S-3 the successor 7 → 12 is the corpus's (artifact digest fb9b1221…, P2SH aa209a21…)", async () => {
    const s = await gatherV1SuccessorFacts({ record: counterRecord, contractName: "Counter", constructorArgs: SEVEN, stateToConstructorArg: { value: 0 }, nextState: { value: { kind: "int", value: 12n } } });
    expect(s.artifactSha256).toBe("fb9b122142c1f6244360df72ee687820d52b4c894b1938e8ac379d8a11a206c7");
    expect(s.lock.script).toBe("aa209a21b4329548b2d67f62942d65eb32dfd25227d7df7afccb3a5e9bb922e21ac487");
  });
});

describe("phase 2 fixtures · what the pinned silverc writes", () => {
  it("S-4 every phase 2 fixture (fanout, matrix, terminable, kcc20, twooftwo, implicitto) is the artifact and AST silverc gives its source and arguments, byte for byte", async () => {
    const P2 = path.join(__dirname, "fixtures", "v1-engine", "phase2");
    const int = (v: number): SilArtifactValue => ({ kind: "int", value: BigInt(v) });
    const b32 = (n: number): SilArtifactValue => ({ kind: "bytes", value: new Array(32).fill(n) });
    const pub = (key: string): SilArtifactValue => ({ kind: "bytes", value: Array.from(Buffer.from(String(new k.PrivateKey(key).toPublicKey().toXOnlyPublicKey().toString()), "hex")) });
    const cases: Record<string, SilArtifactValue[]> = {
      fanout: [int(3), int(10)],
      matrix: [int(2), int(2), int(100), b32(7)],
      terminable: [int(100), b32(7)],
      kcc20: [b32(9), int(1000), { kind: "byte", value: 0 }, { kind: "bool", value: false }, int(2), int(2)],
      twooftwo: [pub("11".repeat(32)), pub("22".repeat(32))],
      implicitto: [int(100), b32(7)]
    };
    for (const [name, args] of Object.entries(cases)) {
      const source = fs.readFileSync(path.join(P2, `${name}.sil`));
      const c = await compileSilverScript({ source, constructorArgs: args });
      expect([name, sha(c.artifactBytes)]).toEqual([name, sha(fs.readFileSync(path.join(P2, `${name}.artifact.json`)))]);
      expect([name, await parseSilverSourceAst(source)]).toEqual([name, JSON.parse(fs.readFileSync(path.join(P2, `${name}.ast.json`), "utf8"))]);
    }
  });
});

describe("F1.5 · the engine on silverc facts", () => {
  it("E-S1 the corpus transition end to end (facts and successor from silverc): txid 611cd372…", async () => {
    const COVENANT_ID = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";
    const GENESIS_TX = "3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917";
    const COUNTER_ADDR = "kaspasim:pqt8xhg7hqt0a6qa4ke6f599dtdse8g02jaca3syhncp0m2akhu8737p5jrg8";
    const SUCCESSOR_ADDR = "kaspasim:pzdzrdpjj4yt94nlv22z6e0txt0ay5386l0h4lxt8f0fhwfzugdvg7qze9dl5";
    const body: V1PlanBody = {
      txVersion: 1,
      inputs: [{ outpoint: { transactionId: GENESIS_TX, index: 0 }, amountSompi: "1000000000", address: COUNTER_ADDR, scriptPublicKey: "0000aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87", covenantId: COVENANT_ID, kind: "covenant", computeBudget: 0, contract: { compileRecord: { contentHash: counterRecord.contentHash, artifactSha256: counterRecord.provenance.artifactSha256 }, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }], entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] } }],
      outputs: [{ address: SUCCESSOR_ADDR, amountSompi: "999699900", covenant: { authorizingInput: 0, covenantId: COVENANT_ID } }],
      covenantOutpoints: [`${GENESIS_TX}:0`],
      nextState: [{ covenantId: COVENANT_ID, input: 0, outputs: [0], successor: { artifactSha256: "fb9b122142c1f6244360df72ee687820d52b4c894b1938e8ac379d8a11a206c7", constructorArgs: [{ kind: "int", value: "12" }], stateToConstructorArg: { value: 0 }, state: { value: { kind: "int", value: "12" } } } }],
      estimatedFeeSompi: "300100", estimatedMass: "719", storageMass: "1", maxFeeSompi: "1000000"
    };
    const plan = createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "f", address: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw" }, to: { input: "c", address: SUCCESSOR_ADDR }, amountSompi: 999_699_900n, body, ctx });
    const records = new Map([[counterRecord.contentHash, counterRecord]]);
    const r = await buildV1Transaction({
      plan,
      node: { networkId: "simnet", utxosByAddresses: async () => new Map([[`${GENESIS_TX}:0`, { amountSompi: 1_000_000_000n, scriptPublicKey: "0000aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87", covenantId: COVENANT_ID }]]) },
      facts: {
        contract: (ref: any) => gatherV1ContractFacts({ record: records.get(ref.compileRecord.contentHash)!, contractName: ref.contract, constructorArgs: ref.constructorArgs.map((a: any, i: number) => v1ArgToSil(a, `ctor[${i}]`)) }),
        successor: (p: any, idx: number, current) => {
          const n = p.nextState.find((x: any) => x.input === idx);
          return gatherV1SuccessorFacts({ record: records.get(p.inputs[idx].contract.compileRecord.contentHash)!, contractName: current.contractName, constructorArgs: current.constructorArgs, stateToConstructorArg: n.successor.stateToConstructorArg, nextState: Object.fromEntries(Object.entries(n.successor.state).map(([f, v]: any) => [f, v1ArgToSil(v)])) });
        }
      },
      keys: { publicKeyOf: () => undefined, privateKeyOf: async () => { throw new Error("no key may be read"); } }
    });
    expect(r.txId).toBe("611cd372b448fbce17b3683e710be193dbd78380bde8845fa5ededfaec75ac54");
  });

  it("E-S2 a signed P2SH contract compiled for a throwaway key: the engine fills the slot with that key's SIGHASH_ALL signature", async () => {
    const ownerKey = crypto.createHash("sha256").update("v1e signed release owner").digest("hex");
    const owner = String(new k.PrivateKey(ownerKey).toPublicKey().toXOnlyPublicKey().toString());
    const src = "pragma silverscript ^0.1.0;\n\ncontract SignedRelease(pubkey owner) {\n    entry release(sig ownerSig) {\n        require(checkSig(ownerSig, owner));\n    }\n}\n";
    const args: SilArtifactValue[] = [{ kind: "bytes", value: Uint8Array.from(Buffer.from(owner, "hex")) }];
    const record = await recordOf(src, args, "b".repeat(64));
    const facts = await gatherV1ContractFacts({ record, contractName: "SignedRelease", constructorArgs: args });
    const spk = facts.lock.version.toString(16).padStart(4, "0") + facts.lock.script;
    const addr = k.addressFromScriptPublicKey(new k.ScriptPublicKey(facts.lock.version, facts.lock.script), "simnet").toString();
    const payee = String(new k.PrivateKey("33".repeat(32)).toKeypair().toAddress("simnet"));
    const storage = v1StorageMass([{ amountSompi: 200_000_000n, scriptBytes: 35, covenantId: false }], [{ amountSompi: 199_000_000n, scriptBytes: 34, covenantId: false }])!;
    const body: V1PlanBody = {
      txVersion: 1,
      inputs: [{ outpoint: { transactionId: "d".repeat(64), index: 0 }, amountSompi: "200000000", address: addr, scriptPublicKey: spk, kind: "p2sh", computeBudget: 10, contract: { compileRecord: { contentHash: record.contentHash, artifactSha256: record.provenance.artifactSha256 }, contract: "SignedRelease", constructorArgs: [{ kind: "bytes", value: Array.from(Buffer.from(owner, "hex")) }], entry: "release", args: [{ kind: "signer", signer: "owner" }] } }],
      outputs: [{ address: payee, amountSompi: "199000000", role: "payment" }],
      estimatedFeeSompi: "1000000", estimatedMass: "0", storageMass: String(storage), maxFeeSompi: "2000000"
    };
    const plan = createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "owner", address: payee }, to: { input: "payee", address: payee }, amountSompi: 199_000_000n, body, ctx });
    const resolved: string[] = [];
    const r = await buildV1Transaction({
      plan,
      node: { networkId: "simnet", utxosByAddresses: async () => new Map([[`${"d".repeat(64)}:0`, { amountSompi: 200_000_000n, scriptPublicKey: spk }]]) },
      facts: { contract: async () => facts, successor: async () => { throw new Error("no successor"); } },
      keys: { publicKeyOf: (a) => (a === "owner" ? owner : undefined), privateKeyOf: async (a) => { resolved.push(a); return ownerKey; } }
    });
    expect(resolved).toEqual(["owner"]);
    // the unlock is: push(65-byte sig ending in SIGHASH_ALL) · push(dispatch tag) · push(redeem script); everything after
    // the signature is the entry's own encoding (the same as with a placeholder signature)
    const unlock = Buffer.from(r.signatureScripts[0]!, "hex");
    expect(unlock[0]).toBe(0x41);
    expect(unlock[65]).toBe(0x01);
    expect(unlock.subarray(1, 65).equals(Buffer.alloc(64))).toBe(false);
    const { encodeSilverEntryArgs, silverUnlockScript } = await import("@hardkas/core");
    const placeholder = Buffer.from(silverUnlockScript(facts.bytecodeHex, encodeSilverEntryArgs({ artifact: facts.artifact, contractName: "SignedRelease", entry: "release", args: [{ kind: "bytes", value: new Uint8Array(65) }] })), "hex");
    expect(unlock.length).toBe(placeholder.length);
    expect(unlock.subarray(66).equals(placeholder.subarray(66))).toBe(true);
    expect(r.txId).toBe(String(r.transaction.id));
  });
});
