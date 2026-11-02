import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  parseSilAbiArtifact,
  silContractBytecodeHex,
  silverUnlockScript
} from "@hardkas/core";
import {
  V1_MASS_PARAMS,
  assertV1MassWithinLimits,
  calculateUpstreamStorageMass,
  measureV1Mass,
  v1EstimatedSerializedSize,
  v1FeeMass,
  v1MassShapeOfWasmTransaction,
  v1MinimumRelayFee,
  v1NonContextualMasses,
  v1StorageMass,
  v1UtxoPlurality
} from "../src/index.js";

// -----------------------------------------------------------------------------
// F1.2 · v1 mass and fee as rusty-kaspa 2.1.0 computes them. Vectors: the Counter genesis and transition of the corpus
// (fixtures/toccata-v2/silver/covenant-counter-transition, accepted by rusty-kaspad 2.1.0 in simnet) and hand-checked
// KIP-9 cases for each branch of calc_storage_mass. Offline; the pinned kaspa-wasm only builds the unlock script and the
// control transaction.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const CORPUS = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "covenant-counter-transition");
const P2SH = 35; // aa 20 <32> 87
const P2PK = 34; // 20 <32> ac
const SIG_P2PK = 66; // OP_DATA_65 + 64-byte Schnorr + sighash type

let unlock = "";
beforeAll(() => {
  loadManagedKaspaWasmSync();
  const current = parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(CORPUS, "current.artifact.json"), "utf8")));
  const { contract } = getSilContract(current, "Counter");
  unlock = silverUnlockScript(
    silContractBytecodeHex(contract),
    encodeSilverEntryArgs({ artifact: current, contractName: "Counter", entry: "__covenant_entrypoint_auth_bump", args: [{ kind: "int", value: 5n }] })
  );
});

const genesisShape = { version: 1, inputs: [{ signatureScriptBytes: SIG_P2PK, computeBudget: 10 }], outputs: [{ scriptBytes: P2SH, covenant: true }, { scriptBytes: P2PK, covenant: false }], payloadBytes: 0 };

describe("F1.2 · the corpus Counter genesis (budget 10, fee paid 408,300)", () => {
  it("M-1 size 353 and compute mass 2,083 (1,000 g of it is the budget); transient 1,412", () => {
    const m = v1NonContextualMasses(genesisShape);
    expect(m.size).toBe(353n);
    expect(m.computeMass).toBe(2083n);
    expect(m.transientMass).toBe(1412n);
  });

  it("M-2 the node's floor is 208,300 (compute dominates); the 408,300 paid covers it", () => {
    const feeMass = v1FeeMass(v1NonContextualMasses(genesisShape));
    expect(feeMass).toBe(2083n);
    expect(v1MinimumRelayFee(feeMass)).toBe(208_300n);
    expect(408_300n >= v1MinimumRelayFee(feeMass)).toBe(true);
  });

  it("M-3 storage mass 4,083 with the plurality of the bound P2SH output (p = 2); the SDK's 1,083 ignores it", () => {
    const funding = 4_000_000_000n; // inside the range of funding amounts the corpus's declared storage mass allows
    const change = funding - 1_000_000_000n - 408_300n;
    const node = v1StorageMass(
      [{ amountSompi: funding, scriptBytes: P2PK, covenantId: false }],
      [{ amountSompi: 1_000_000_000n, scriptBytes: P2SH, covenantId: true }, { amountSompi: change, scriptBytes: P2PK, covenantId: false }]
    );
    expect(node).toBe(4083n);
    expect(calculateUpstreamStorageMass([funding], [1_000_000_000n, change], "simnet")).toBe(1083n);
  });
});

describe("F1.2 · the corpus Counter transition (budget 0, fee paid 300,100)", () => {
  it("M-4 the reconstructed signature script is the corpus's (sha256 d03f34c3…)", () => {
    expect(crypto.createHash("sha256").update(Buffer.from(unlock, "hex")).digest("hex")).toBe("d03f34c3a0a33d8c5470fa08c492809c198dfa9187f505218a4ea99a28d5ed20");
  });

  it("M-5 its floor is 71,900 (114-byte unlock: compute 719 g against a normalized transient of 698), below the fee paid", () => {
    const L = unlock.length / 2;
    expect(L).toBe(114);
    const shape = { version: 1, inputs: [{ signatureScriptBytes: L, computeBudget: 0 }], outputs: [{ scriptBytes: P2SH, covenant: true }], payloadBytes: 0 };
    const m = v1NonContextualMasses(shape);
    expect(m.size).toBe(349n);
    expect(m.computeMass).toBe(719n);
    expect(v1FeeMass(m)).toBe(719n);
    const floor = v1MinimumRelayFee(v1FeeMass(m));
    expect(floor).toBe(71_900n);
    expect(floor <= 300_100n).toBe(true);
  });

  it("M-6 storage mass 1 with plurality (covenant input and bound output, p = 2 each: relaxed formula); HardKAS declared 0", () => {
    const node = v1StorageMass(
      [{ amountSompi: 1_000_000_000n, scriptBytes: P2SH, covenantId: true }],
      [{ amountSompi: 999_699_900n, scriptBytes: P2SH, covenantId: true }]
    );
    expect(node).toBe(1n);
    expect(calculateUpstreamStorageMass([1_000_000_000n], [999_699_900n], "simnet")).toBe(0n);
  });

  it("M-7 the shape read from a kaspa-wasm v1 transaction is the one the formulas take", () => {
    const k = loadManagedKaspaWasmSync();
    const outpoint = { transactionId: "3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917", index: 0 };
    const current = { version: 0, script: "aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87" };
    const successor = { version: 0, script: "aa209a21b4329548b2d67f62942d65eb32dfd25227d7df7afccb3a5e9bb922e21ac487" };
    const covenantId = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";
    const tx = new k.Transaction({
      version: 1,
      inputs: [{ previousOutpoint: outpoint, signatureScript: unlock, sequence: 0n, sigOpCount: 0, computeBudget: 0, utxo: { outpoint, amount: 1_000_000_000n, scriptPublicKey: new k.ScriptPublicKey(current.version, current.script), blockDaaScore: 0n, isCoinbase: false } }],
      outputs: [{ value: 999_699_900n, scriptPublicKey: new k.ScriptPublicKey(successor.version, successor.script), covenant: { authorizingInput: 0, covenantId } }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.finalize();
    // the corpus transition's id: the shape below is the transaction the node accepted
    expect(String(tx.id)).toBe("611cd372b448fbce17b3683e710be193dbd78380bde8845fa5ededfaec75ac54");
    const shape = v1MassShapeOfWasmTransaction(tx);
    expect(shape).toEqual({ version: 1, inputs: [{ signatureScriptBytes: unlock.length / 2, computeBudget: 0, sigOpCount: undefined }], outputs: [{ scriptBytes: P2SH, covenant: true }], payloadBytes: 0 });
  });
});

describe("F1.2 · each branch of calc_storage_mass (KIP-9 with plurality), by hand", () => {
  const C = V1_MASS_PARAMS.storageMassParameter;
  const p2pk = (v: bigint) => ({ amountSompi: v, scriptBytes: P2PK, covenantId: false });

  it("M-8 plurality: P2PK 1, P2SH 1, P2SH with a covenant id 2, a 200-byte script 3", () => {
    expect(v1UtxoPlurality(P2PK, false)).toBe(1n);
    expect(v1UtxoPlurality(P2SH, false)).toBe(1n);
    expect(v1UtxoPlurality(P2SH, true)).toBe(2n);
    expect(v1UtxoPlurality(200, false)).toBe(3n);
  });

  it("M-9 relaxed, one output: C/out − Σ C/in", () => {
    expect(v1StorageMass([p2pk(3n * 10n ** 8n), p2pk(2n * 10n ** 8n), p2pk(10n ** 8n)], [p2pk(5n * 10n ** 7n)])).toBe(C / (5n * 10n ** 7n) - (C / (3n * 10n ** 8n) + C / (2n * 10n ** 8n) + C / 10n ** 8n));
  });

  it("M-10 arithmetic: three inputs and two outputs (inputs' mean)", () => {
    const ins = [p2pk(10n ** 8n), p2pk(10n ** 8n), p2pk(10n ** 8n)];
    const outs = [p2pk(10n ** 7n), p2pk(10n ** 7n)];
    const expected = (C / 10n ** 7n) * 2n - 3n * (C / 10n ** 8n);
    expect(v1StorageMass(ins, outs)).toBe(expected);
  });

  it("M-11 two P2PK inputs and two P2PK outputs: outputs' and inputs' plurality 2 → relaxed (harmonic inputs)", () => {
    const ins = [p2pk(10n ** 8n), p2pk(3n * 10n ** 8n)];
    const outs = [p2pk(10n ** 7n), p2pk(10n ** 7n)];
    expect(v1StorageMass(ins, outs)).toBe(2n * (C / 10n ** 7n) - (C / 10n ** 8n + C / (3n * 10n ** 8n)));
  });

  it("M-12 two inputs, three outputs: arithmetic; saturates at 0 when the inputs outweigh the outputs", () => {
    const ins = [p2pk(10n ** 6n), p2pk(10n ** 6n)];
    const outs = [p2pk(10n ** 9n), p2pk(10n ** 9n), p2pk(10n ** 9n)];
    expect(v1StorageMass(ins, outs)).toBe(0n);
  });

  it("M-13 a term above u64 is the node's overflow (undefined)", () => {
    expect(v1StorageMass([p2pk(10n ** 8n)], [{ amountSompi: 1n, scriptBytes: 10_000_000, covenantId: false }])).toBeUndefined();
  });
});

describe("F1.2 · fee floor and limits", () => {
  it("M-14 a fee mass of 0 still costs the minimum relay fee; the floor never exceeds MAX_SOMPI", () => {
    expect(v1MinimumRelayFee(0n)).toBe(100_000n);
    expect(v1MinimumRelayFee(2n ** 62n)).toBe(V1_MASS_PARAMS.maxSompi);
  });

  it("M-15 v0 prices sig-ops at 1,000 g and counts no budget bytes; v1 refuses an input without a u16 budget", () => {
    const v0 = v1NonContextualMasses({ version: 0, inputs: [{ signatureScriptBytes: SIG_P2PK, sigOpCount: 1 }], outputs: [{ scriptBytes: P2PK, covenant: false }], payloadBytes: 0 });
    expect(v0.size).toBe(v1EstimatedSerializedSize({ version: 0, inputs: [{ signatureScriptBytes: SIG_P2PK }], outputs: [{ scriptBytes: P2PK, covenant: false }], payloadBytes: 0 }));
    expect(v0.computeMass).toBe(v0.size + 36n * 10n + 1000n);
    expect(() => v1NonContextualMasses({ version: 1, inputs: [{ signatureScriptBytes: 66 }], outputs: [], payloadBytes: 0 })).toThrow(/V1_MASS_SHAPE_INVALID/);
    expect(() => v1NonContextualMasses({ version: 1, inputs: [{ signatureScriptBytes: 66, computeBudget: 70_000 }], outputs: [], payloadBytes: 0 })).toThrow(/V1_MASS_SHAPE_INVALID/);
  });

  it("M-16 above a block limit: TX_MASS_ABOVE_STANDARD_LIMIT (compute over 500,000 with a large budget)", () => {
    const m = measureV1Mass({ version: 1, inputs: [{ signatureScriptBytes: 66, computeBudget: 6000 }], outputs: [{ scriptBytes: P2PK, covenant: false }], payloadBytes: 0 }, { inputs: [{ amountSompi: 10n ** 9n, scriptBytes: P2PK, covenantId: false }], outputs: [{ amountSompi: 10n ** 8n, scriptBytes: P2PK, covenantId: false }] });
    expect(m.computeMass > 500_000n).toBe(true);
    expect(m.withinBlockLimits).toBe(false);
    expect(() => assertV1MassWithinLimits(m)).toThrow(/TX_MASS_ABOVE_STANDARD_LIMIT/);
  });

  it("M-17 the payload counts 1 g per byte in the size (not the SDK's 2 g/B)", () => {
    const a = v1NonContextualMasses({ version: 1, inputs: [{ signatureScriptBytes: 66, computeBudget: 0 }], outputs: [], payloadBytes: 0 });
    const b = v1NonContextualMasses({ version: 1, inputs: [{ signatureScriptBytes: 66, computeBudget: 0 }], outputs: [], payloadBytes: 100 });
    expect(b.computeMass - a.computeMass).toBe(100n);
  });
});
