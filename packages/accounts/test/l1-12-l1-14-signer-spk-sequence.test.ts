import { describe, it, expect, beforeAll, vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { TxPlanService, scriptPublicKeyFromHex, measureUpstreamMass } from "@hardkas/tx-builder";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { toWasmScriptPublicKey } from "../src/wasm-transaction.js";

// -----------------------------------------------------------------------------
// L1-12 · a scriptPublicKey string "<2-byte version as 4 hex><script>" was decoded only at 72 hex (version 0 + a 34-byte
// P2PK Schnorr script) in the signer (kaspa-wasm-signer.ts), toWasmScriptPublicKey (wasm-transaction.ts) and the mass
// estimate (tx-builder mass.ts); a versioned P2SH (35 bytes) or ECDSA P2PK (35 bytes) string was read as a 37-byte bare
// script, so the sighash and the mass covered the wrong UTXO script. The rule is now the Generator planner's
// (generator-plan.ts `ownScriptHex`): `0000` + any script; any other hex string is a bare version-0 script.
//
// L1-14 · the v1 path of the internal signer built its inputs with `inputSequences: "as-built"`, kaspa-wasm's numbering
// (input k gets sequence k): a RELATIVE LOCK of k DAA (consensus check_sequence_lock), so input k could not spend a UTXO
// accepted less than k DAA ago. It now gets sequence 0 unless the plan states one (V1-ENGINE-2 `inputs[].sequence`), as
// the v0 path does since TX-SEQUENCE-1. Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const repoRoot = path.resolve(__dirname, "../../..");
let k: any;
let officialTxIdOf: (rpcTx: unknown) => string;
const KEY_A = "1111".padStart(64, "0");
const KEY_B = "2222".padStart(64, "0");
let alice: string;
let bob: string;

const P2SH = "aa20" + "ab".repeat(32) + "87"; // 35 bytes
const ECDSA_P2PK = "21" + "02" + "cd".repeat(32) + "ab"; // 35 bytes
const P2PK = "20" + "ef".repeat(32) + "ac"; // 34 bytes

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  officialTxIdOf = (await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href)).officialTxIdOf;
  alice = new k.PrivateKey(KEY_A).toKeypair().toAddress("simnet").toString();
  bob = new k.PrivateKey(KEY_B).toKeypair().toAddress("simnet").toString();
});

describe("L1-12 · versioned scriptPublicKey strings of any length", () => {
  it("scriptPublicKeyFromHex: `0000` + any script is version 0 + that script; other hex is a bare version-0 script", () => {
    for (const script of [P2PK, P2SH, ECDSA_P2PK, "51", ""]) {
      expect(scriptPublicKeyFromHex("0000" + script), script || "(empty)").toEqual({ version: 0, script });
    }
    for (const bare of [P2PK, P2SH, ECDSA_P2PK]) expect(scriptPublicKeyFromHex(bare)).toEqual({ version: 0, script: bare });
    expect(scriptPublicKeyFromHex("0g")).toBeUndefined();
    expect(scriptPublicKeyFromHex("000")).toBeUndefined();
  });

  it("toWasmScriptPublicKey decodes a 74-hex P2SH or ECDSA string as version 0 + the 35-byte script (it kept the 37-byte string)", () => {
    for (const script of [P2PK, P2SH, ECDSA_P2PK]) {
      const spk = toWasmScriptPublicKey(k, "0000" + script);
      expect({ version: Number(spk.version), script: String(spk.script) }, script).toEqual({ version: 0, script });
      const bare = toWasmScriptPublicKey(k, script);
      expect({ version: Number(bare.version), script: String(bare.script) }).toEqual({ version: 0, script });
    }
    const explicit = toWasmScriptPublicKey(k, { version: 0, scriptPublicKey: P2SH });
    expect(String(explicit.script)).toBe(P2SH);
  });

  it("the mass estimate prices a versioned P2SH output string as its 35-byte script (same mass as the explicit form)", () => {
    const base = { inputs: [{ amountSompi: 1_000_000_000n, scriptPublicKey: "0000" + P2PK }], networkId: "simnet" } as const;
    const versioned = measureUpstreamMass({ ...base, outputs: [{ amountSompi: 500_000_000n, scriptPublicKey: "0000" + P2SH }] } as any);
    const explicit = measureUpstreamMass({ ...base, outputs: [{ amountSompi: 500_000_000n, scriptPublicKey: { version: 0, script: P2SH } }] } as any);
    const misread = measureUpstreamMass({ ...base, outputs: [{ amountSompi: 500_000_000n, scriptPublicKey: { version: 0, script: "0000" + P2SH } }] } as any);
    expect(versioned.mass).toBe(explicit.mass);
    expect(misread.mass, "a 37-byte script would cost more").toBeGreaterThan(explicit.mass);
  });

  it("the signer hands kaspa-wasm the UTXO's 35-byte script for a 74-hex versioned string (the sighash covers it)", async () => {
    const plan = v0Plan([{ amount: 300_000_000n, spk: "0000" + ECDSA_P2PK }]);
    const seen: Array<{ version: number; script: string }> = [];
    const signer = new KaspaWasmPrivateKeySigner({});
    await signer.signTxPlan({
      planArtifact: plan,
      authorizers: {
        0: {
          authorize: (ctx: any) => {
            const u = ctx.wasmTransaction.inputs[0].utxo;
            seen.push({ version: Number(u.scriptPublicKey.version), script: String(u.scriptPublicKey.script) });
            return { kind: "signature-script", signatureScript: "51" };
          }
        }
      }
    } as any);
    expect(seen).toEqual([{ version: 0, script: ECDSA_P2PK }]);
  });
});

/** A balanced v0 plan over the given UTXOs (outpoints, amounts, script strings) paying bob, fee 30 000. */
function v0Plan(utxos: Array<{ amount: bigint; spk: string }>): any {
  const total = utxos.reduce((s, u) => s + u.amount, 0n);
  return {
    schema: "hardkas.txPlan",
    networkId: "simnet",
    mode: "rpc",
    from: { address: alice, input: "alice" },
    to: { address: bob, input: "bob" },
    amountSompi: String(100_000_000n),
    inputs: utxos.map((u, i) => ({
      outpoint: { transactionId: (i + 1).toString(16).padStart(64, "e"), index: i },
      address: alice,
      amountSompi: String(u.amount),
      scriptPublicKey: u.spk,
      blockDaaScore: "1000",
      isCoinbase: false
    })),
    outputs: [{ address: bob, amountSompi: String(100_000_000n) }],
    change: { address: alice, amountSompi: String(total - 100_000_000n - 30_000n) },
    estimatedFeeSompi: "30000",
    estimatedMass: "3000"
  };
}

const UTXO_AMOUNTS = [300_000_000n, 250_000_000n, 200_000_000n];
const utxoOf = (n: number) => ({
  outpoint: { transactionId: (n + 1).toString(16).padStart(64, "a"), index: n },
  address: alice,
  amountSompi: UTXO_AMOUNTS[n]!,
  scriptPublicKey: expectedScriptPublicKeyHex(alice)!,
  blockDaaScore: 0n,
  isCoinbase: false
});

/** A v1 payment over several inputs: the planned v0 payment relabelled as version 1 (as v1-txid-1.test.ts does). */
async function v1Plan(amount: bigint): Promise<any> {
  const utxos = UTXO_AMOUNTS.map((_, n) => utxoOf(n));
  const planned = await new TxPlanService({ getUtxos: async () => utxos }).planTransactionUpstream({
    fromAddress: alice,
    toAddress: bob,
    amountSompi: amount,
    networkId: "simnet"
  } as any);
  (planned.plan as any).version = 1;
  // a v1 input states its compute budget (the signer refuses an unstated one: kaspa-wasm-signer-v1-budget.test.ts)
  (planned.plan as any).computeBudget = 10n;
  return createTxPlanArtifact({
    ctx: systemRuntimeContext,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: alice, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi: amount,
    plan: planned.plan
  } as any);
}

const sign = (plan: any) =>
  new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "alice", network: "simnet", address: alice, privateKey: KEY_A } as any }).signTxPlan({
    planArtifact: plan
  } as any);
const payloadOf = (result: any) => {
  let tx: any = JSON.parse(result.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};

describe("L1-14 · the v1 path of the internal signer: sequence 0 unless the plan states one", () => {
  it("a multi-input v1 payment: every input at sequence 0 (it was 0, 1, 2: a relative lock of k DAA on input k); id official", async () => {
    const plan = await v1Plan(600_000_000n);
    expect(plan.txVersion).toBe(1);
    expect(plan.inputs.length).toBeGreaterThanOrEqual(2);
    const result = await sign(plan);
    const payload = payloadOf(result);
    expect(payload.inputs.map((i: any) => String(i.sequence))).toEqual(plan.inputs.map(() => "0"));
    expect(result.txId).toBe(officialTxIdOf(payload));
  });

  it("a sequence the plan states (V1-ENGINE-2 inputs[].sequence, u64 decimal) is kept on that input; the others stay 0", async () => {
    const plan = await v1Plan(600_000_000n);
    plan.inputs[1].sequence = "500";
    const result = await sign(plan);
    const payload = payloadOf(result);
    expect(payload.inputs.map((i: any) => String(i.sequence))).toEqual(plan.inputs.map((_: unknown, n: number) => (n === 1 ? "500" : "0")));
    expect(result.txId).toBe(officialTxIdOf(payload));
  });

  it("control · a v0 payment keeps sequence 0 on every input (TX-SEQUENCE-1) and also honours a stated sequence", async () => {
    const plan = v0Plan([{ amount: 300_000_000n, spk: expectedScriptPublicKeyHex(alice)! }, { amount: 200_000_000n, spk: expectedScriptPublicKeyHex(alice)! }]);
    const plain = payloadOf(await sign(plan));
    expect(plain.inputs.map((i: any) => String(i.sequence))).toEqual(["0", "0"]);
    plan.inputs[0].sequence = "7";
    const result = await sign(plan);
    const stated = payloadOf(result);
    expect(stated.inputs.map((i: any) => String(i.sequence))).toEqual(["7", "0"]);
    expect(result.txId).toBe(officialTxIdOf(stated));
  });
});
