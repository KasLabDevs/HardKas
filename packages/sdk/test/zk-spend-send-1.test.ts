import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { validateV1Transition } from "@hardkas/accounts";
import { buildR0Groth16Scripts, buildR0Groth16Transaction, buildR0Groth16Plan, spendR0Groth16Lock, assertSpendableZkLock } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000 });

// -----------------------------------------------------------------------------
// ZK-SEND-1 · sdk.zk.toccata.spend (spendR0Groth16Lock) without a node: its refusals come first and touch nothing (no
// read, no write, no send), and what it hands sdk.tx.send is the plan's transaction with the lock's unlock — which the
// send check (validateV1Transition with the supplied unlock) accepts, and refuses for any other script. The node half
// is zk-spend-send.simnet.test.ts. kaspa-wasm (pinned) only.
// -----------------------------------------------------------------------------

const fixture = path.resolve(__dirname, "../../../fixtures/toccata-v2/zk/r0-groth16-official");
const imageId: string = JSON.parse(fs.readFileSync(path.join(fixture, "image-id.json"), "utf8")).imageId;
const journalHash: string = JSON.parse(fs.readFileSync(path.join(fixture, "journal.json"), "utf8")).journalHash;
const receiptHex = fs.readFileSync(path.join(fixture, "receipt.hex"), "utf8").trim();
const TXID = "ab".repeat(32);
let k: any;
let payee = "";
let tn10Payee = "";
let proofOnly: any;
let bound: any;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  payee = new k.PrivateKey("44".repeat(32)).toAddress("simnet").toString();
  tn10Payee = new k.PrivateKey("44".repeat(32)).toAddress("testnet-10").toString();
  proofOnly = buildR0Groth16Scripts({ imageId, journalHash, receiptHex });
  bound = buildR0Groth16Scripts({ imageId, journalHash, receiptHex, bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payee, amountSompi: 100_000_000n } } });
  expect(proofOnly.ok && bound.ok).toBe(true);
});

/** A stand-in for a Hardkas instance: every method a spend could reach is a spy. */
function fakeSdk(o: { network?: string; config?: any; mode?: string; allowPublic?: boolean; utxos?: any[]; send?: (signed: any, opts: any) => any } = {}) {
  const network = o.network ?? "simnet";
  const sdk: any = {
    network,
    config: { config: o.config ?? {} },
    execution: { mode: o.mode ?? "rpc", domain: "kaspa-l1", network },
    policy: { allowPublic: o.allowPublic === true },
    workspace: { root: path.resolve(__dirname) },
    rpc: { getUtxosByAddress: vi.fn(async () => o.utxos ?? []) },
    artifacts: { write: vi.fn(async (a: any) => ({ absolutePath: `/store/${String(a.schema)}-${String(a.contentHash).slice(0, 8)}.json`, artifact: a })) },
    tx: { send: vi.fn(async (signed: any, opts: any) => (o.send ? o.send(signed, opts) : { submitted: true, txId: signed.txId, receipt: {}, submission: {} })) }
  };
  return sdk;
}
const untouched = (sdk: any) => {
  expect(sdk.rpc.getUtxosByAddress).not.toHaveBeenCalled();
  expect(sdk.artifacts.write).not.toHaveBeenCalled();
  expect(sdk.tx.send).not.toHaveBeenCalled();
};
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "NO_ERROR";
  } catch (e: any) {
    return e?.code ?? `UNCODED: ${String(e?.message ?? e).slice(0, 160)}`;
  }
};
const utxo = (amountSompi?: bigint) => ({ transactionId: TXID, index: 0, ...(amountSompi !== undefined ? { amountSompi } : {}) });

describe("ZK-SEND-1 · refusals before anything is read, written or sent", () => {
  it("mainnet (any spelling, an alias that declares it) is MAINNET_BROADCAST_DISABLED", async () => {
    for (const net of ["mainnet", "kaspa", "kaspa-mainnet", "MAINNET", "mainnet-1"]) {
      const sdk = fakeSdk({ network: net });
      expect(await codeOf(spendR0Groth16Lock(sdk, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: payee })), net).toBe("MAINNET_BROADCAST_DISABLED");
      untouched(sdk);
    }
    const alias = fakeSdk({ network: "prod", config: { networks: { prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: "ws://127.0.0.1:9" } } } });
    expect(await codeOf(spendR0Groth16Lock(alias, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: payee }))).toBe("MAINNET_BROADCAST_DISABLED");
    untouched(alias);
  });

  it("the simulator, a network without ZK lock addresses and an alias of another network are refused", async () => {
    const sim = fakeSdk({ mode: "simulator" });
    expect(await codeOf(spendR0Groth16Lock(sim, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: payee }))).toBe("ZK_SPEND_NODE_REQUIRED");
    untouched(sim);
    const devnet = fakeSdk({ network: "devnet" });
    expect(await codeOf(spendR0Groth16Lock(devnet, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: payee }))).toBe("ZK_SPEND_NETWORK_UNSUPPORTED");
    untouched(devnet);
    const alias = fakeSdk({ network: "simnet", config: { networks: { simnet: { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://127.0.0.1:9" } } } });
    expect(await codeOf(spendR0Groth16Lock(alias, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: payee }))).toBe("ZK_SPEND_NETWORK_UNSUPPORTED");
    untouched(alias);
  });

  it("testnet-10 only behind the payments' opt-in (experimental + allowPublic); a public program's proof-only lock never there", async () => {
    const blocked = fakeSdk({ network: "testnet-10" });
    expect(await codeOf(spendR0Groth16Lock(blocked, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: tn10Payee }))).toBe("PUBLIC_NETWORK_BLOCKED");
    untouched(blocked);
    const half = fakeSdk({ network: "testnet-10", allowPublic: true });
    expect(await codeOf(spendR0Groth16Lock(half, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: tn10Payee }))).toBe("PUBLIC_NETWORK_BLOCKED");
    untouched(half);
    const opted = fakeSdk({ network: "testnet-10", allowPublic: true, config: { experimental: true, network: { allowPublic: true } } });
    let err: any;
    await spendR0Groth16Lock(opted, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: tn10Payee }).catch((e) => (err = e));
    expect(err?.code).toBe("ZK_SPEND_BUILD_REFUSED");
    expect(err?.metadata?.issues).toEqual(expect.arrayContaining(["ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED"]));
    untouched(opted);
  });

  it("a lock verify-scripts refuses (tampered redeem script, a P2SH script that is not its hash, a failed build) is ZK_SPEND_LOCK_REFUSED", async () => {
    const flip = (hex: string, at: number) => hex.slice(0, at) + (hex[at] === "0" ? "1" : "0") + hex.slice(at + 1);
    const tamperedRedeem = { ...proofOnly, redeemScript: flip(proofOnly.redeemScript, 300) };
    const tamperedSpk = { ...proofOnly, p2shScriptPublicKey: { ...proofOnly.p2shScriptPublicKey, script: flip(proofOnly.p2shScriptPublicKey.script, 10) } };
    const boundLabelOnly = { ...proofOnly, bindingMode: "proof-and-output-bound", bindingPolicy: bound.bindingPolicy };
    for (const [label, scripts] of [["redeem", tamperedRedeem], ["spk", tamperedSpk], ["not ok", { ...proofOnly, ok: false }], ["bound label on a proof-only lock", boundLabelOnly]] as const) {
      const sdk = fakeSdk();
      expect(await codeOf(spendR0Groth16Lock(sdk, { scripts: scripts as any, utxo: utxo(200_000_000n), destinationAddress: payee })), label).toBe("ZK_SPEND_LOCK_REFUSED");
      untouched(sdk);
      expect(() => assertSpendableZkLock(scripts as any), label).toThrow(/ZK_SPEND_LOCK_REFUSED|not one HardKAS spends|not a successful|not the hash/);
    }
  });

  it("a destination of another network is refused by the builder (ZK_SPEND_BUILD_REFUSED: ZK_DESTINATION_NETWORK_MISMATCH)", async () => {
    const sdk = fakeSdk();
    let err: any;
    await spendR0Groth16Lock(sdk, { scripts: proofOnly, utxo: utxo(200_000_000n), destinationAddress: tn10Payee }).catch((e) => (err = e));
    expect(err?.code).toBe("ZK_SPEND_BUILD_REFUSED");
    expect(err?.metadata?.issues).toEqual(["ZK_DESTINATION_NETWORK_MISMATCH"]);
    untouched(sdk);
  });

  it("without the amount the UTXO is read from the node: one the lock's address does not list is ZK_SPEND_UTXO_NOT_FOUND", async () => {
    const sdk = fakeSdk({ utxos: [] });
    expect(await codeOf(spendR0Groth16Lock(sdk, { scripts: proofOnly, utxo: utxo(), destinationAddress: payee }))).toBe("ZK_SPEND_UTXO_NOT_FOUND");
    expect(sdk.rpc.getUtxosByAddress).toHaveBeenCalledWith(proofOnly.p2shAddresses.simnet);
    expect(sdk.artifacts.write).not.toHaveBeenCalled();
    expect(sdk.tx.send).not.toHaveBeenCalled();
  });
});

describe("ZK-SEND-1 · what the spend hands sdk.tx.send", () => {
  it("the plan states the node's storage mass and declares its outputs as payments (it said 0 and 'change')", () => {
    const withChange = buildR0Groth16Scripts({
      imageId,
      journalHash,
      receiptHex,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payee, amountSompi: 100_000_000n }, change: { address: payee, amountSompi: 50_000_000n } }
    });
    expect(withChange.ok, JSON.stringify(withChange.issues)).toBe(true);
    const params = { scripts: withChange, utxo: { transactionId: TXID, index: 0, amountSompi: withChange.requiredFundingSompi! }, destinationAddress: payee, networkId: "simnet" as const };
    const built = buildR0Groth16Transaction(params);
    expect(built.ok, JSON.stringify(built.issues)).toBe(true);
    const plan: any = buildR0Groth16Plan(params);
    expect(BigInt(plan.storageMass)).toBe(built.storageMass);
    expect(BigInt(plan.storageMass)).toBeGreaterThan(0n);
    expect(plan.outputs.map((o: any) => o.role)).toEqual(["payment", "payment"]);
    expect(BigInt(built.transaction.storageMass)).toBe(built.storageMass);
  });

  for (const mode of ["proof-only", "proof-and-output-bound"] as const) {
    it(`${mode}: the plan, the signed artifact (the plan's transaction with the lock's unlock) and the fact are written, then one sdk.tx.send with the unlock; the send check accepts it and refuses any other script`, async () => {
      const scripts = mode === "proof-only" ? proofOnly : bound;
      const amount = mode === "proof-only" ? 200_000_000n : scripts.requiredFundingSompi;
      const node = [{ outpoint: { transactionId: TXID, index: 0 }, amountSompi: amount, utxoEntry: { amount, scriptPublicKey: { version: 0, script: scripts.p2shScriptPublicKey.script } } }];
      const sdk = fakeSdk({ utxos: node });
      const r = await spendR0Groth16Lock(sdk, { scripts, utxo: utxo(), ...(mode === "proof-only" ? { destinationAddress: payee } : {}) });
      expect(r.txId).toBe(r.built.transactionId);
      const written = sdk.artifacts.write.mock.calls.map((c: any[]) => c[0].schema);
      expect(written).toEqual(["hardkas.txPlan", "hardkas.signedTx", "hardkas.zkVerificationFact.v1"]);
      expect(sdk.tx.send).toHaveBeenCalledTimes(1);
      const [signed, opts] = sdk.tx.send.mock.calls[0];
      expect(signed.lineage.parentArtifactId).toBe(r.plan.contentHash);
      expect(signed.txId).toBe(r.built.transactionId);
      expect(signed.txVersion).toBe(1);
      const payload = JSON.parse(signed.signedTransaction.payload);
      expect(String(payload.inputs[0].signatureScript).toLowerCase()).toBe(scripts.sigScript);
      expect(BigInt(payload.storageMass ?? payload.storage_mass ?? payload.mass)).toBe(BigInt((r.plan as any).storageMass));
      expect(typeof opts.v1Facts.p2shUnlock).toBe("function");
      expect(opts.v1Facts.p2shUnlock({ plan: r.plan, inputIndex: 0 })).toEqual({ unlockScript: scripts.sigScript });
      expect(() => opts.v1Facts.p2shUnlock({ plan: { inputs: [{ kind: "p2pk" }] }, inputIndex: 0 })).toThrow(/ZK_SPEND_UNLOCK_UNAVAILABLE/);
      if (mode === "proof-and-output-bound") {
        expect((r.plan as any).outputs).toEqual([{ address: payee, amountSompi: "100000000", role: "payment" }]);
        expect(r.built.consensusEnforced).toBe(true);
      }
      // the send check itself (what preflightV1Send runs with the node's listing): accepted with this unlock, and only it
      const utxos = new Map([[`${TXID}:0`, { amountSompi: amount, scriptPublicKey: `0000${scripts.p2shScriptPublicKey.script}` }]]);
      const v = validateV1Transition({ plan: r.plan as any, node: { networkId: "simnet", utxos }, facts: () => undefined, successor: () => undefined, signatureScripts: [scripts.sigScript], p2shUnlock: opts.v1Facts.p2shUnlock } as any);
      expect(v.inputs[0]).toEqual({ index: 0, kind: "p2sh", signatureScriptBytes: scripts.sigScript.length / 2 });
      expect(v.feeSompi).toBe(r.built.feeSompi);
      const other = scripts === proofOnly ? bound.sigScript : proofOnly.sigScript;
      expect(() => validateV1Transition({ plan: r.plan as any, node: { networkId: "simnet", utxos }, facts: () => undefined, successor: () => undefined, signatureScripts: [other], p2shUnlock: opts.v1Facts.p2shUnlock } as any)).toThrow(/SIGNED_PLAN_MISMATCH/);
    });
  }
});
