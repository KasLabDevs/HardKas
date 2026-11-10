import { describe, it, expect, beforeAll, vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { TxPlanService, calculateUpstreamStorageMass } from "@hardkas/tx-builder";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// RC1 · D1 · compatibility vectors of the v0 payment format. Owner decision (tx version policy, 26-oct): payments stay
// v0, and their signed bytes, txids and artifacts do not change. These vectors pin that format so a change to it is a
// test failure, never a silent migration:
//   * a v0 payment planned from a fixed fixture (the real planner, the pinned kaspa-wasm Generator) and signed by the
//     accounts signer has a fixed txid, fee and mass, version 0, lock time 0, and COMMITS STORAGE MASS 0 — also when
//     the plan carries a storage mass (the v0 signer never writes the field);
//   * the txid does not cover the storage-mass field (measured with the official kaspa-wasm 2.1.0, R1 evidence 12, for
//     v0 and v1 alike): the same payload committing HardKAS's computed storage mass has the same txid. That is why
//     rusty-kaspad can put its own value on a v0 transaction in its mempool, mine it, and keep the txid (INT9-C V-01,
//     R1 simnet evidence);
//   * v1 does commit it: the signer writes the plan's storage mass into a v1 transaction (v0: always 0).
// Real pinned kaspa-wasm and the official id function, no network. The fixture keys are test-only values.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const KEY_A = "1111".padStart(64, "0");
const KEY_B = "2222".padStart(64, "0");
let k: any;
let officialTxIdOf: (rpcTx: unknown) => string;
let alice = "";
let bob = "";

// Pinned (RC1 · D1). A different value here means the v0 payment format changed: that needs the owner's decision.
const V0_PIN = {
  txId: "b26f6c31063fef123afbd9ae25a556d69f15e5c8c667bf50604db088332ff9d0",
  feeSompi: "315400",
  estimatedMass: "4890",
  computedStorageMass: "4890"
};
const V1_PIN = { txId: "ca256ee244a3ee85bd4c7519c5c8bddb87fc97df39381ef45105d8e0b3a96e4f" };

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  officialTxIdOf = (await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href)).officialTxIdOf;
  alice = String(new k.PrivateKey(KEY_A).toKeypair().toAddress("simnet").toString());
  bob = String(new k.PrivateKey(KEY_B).toKeypair().toAddress("simnet").toString());
});

const UTXO_AMOUNTS = [300_000_000n, 250_000_000n];
const fixtureUtxos = () =>
  UTXO_AMOUNTS.map((amountSompi, n) => ({
    outpoint: { transactionId: (n + 1).toString(16).padStart(64, "a"), index: n },
    address: alice,
    amountSompi,
    scriptPublicKey: expectedScriptPublicKeyHex(alice)!,
    blockDaaScore: 0n,
    isCoinbase: false
  }));

/** The fixture payment: 1 KAS alice → bob over two fixed UTXOs, planned by the real planner, as a v0 plan artifact. */
async function fixturePlan(): Promise<any> {
  const planned = await new TxPlanService({ getUtxos: async () => fixtureUtxos() }).planTransactionUpstream({
    fromAddress: alice,
    toAddress: bob,
    amountSompi: 100_000_000n,
    networkId: "simnet"
  });
  return createTxPlanArtifact({
    ctx: systemRuntimeContext,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: alice, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi: 100_000_000n,
    plan: planned.plan
  } as any);
}

const signer = () => new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "alice", network: "simnet", address: alice, privateKey: KEY_A } as any });
const payloadOf = (result: any) => {
  let tx: any = JSON.parse(result.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};
const storageMassOf = (plan: any, payload: any): bigint =>
  BigInt(
    calculateUpstreamStorageMass(
      (plan.inputs as any[]).map((i) => BigInt(i.amountSompi)),
      (payload.outputs as any[]).map((o) => BigInt(o.value ?? o.amount)),
      "simnet"
    )
  );

describe("RC1 · D1 · v0 payment format: txid pinned, storage mass committed 0, v1 commits it", () => {
  it("D1-V0 the fixture v0 payment signs to the pinned txid, fee and mass; version 0, lock time 0, storage mass committed 0", async () => {
    const plan = await fixturePlan();
    expect(plan.txVersion ?? 0).toBe(0);
    const result: any = await signer().signTxPlan({ planArtifact: plan } as any);
    const payload = payloadOf(result);
    expect({
      txId: result.txId,
      feeSompi: String(plan.estimatedFeeSompi),
      estimatedMass: String(plan.estimatedMass),
      computedStorageMass: String(storageMassOf(plan, payload))
    }).toEqual(V0_PIN);
    expect(result.txId, "the declared txid is the payload's official id").toBe(officialTxIdOf(payload));
    expect(Number(payload.version)).toBe(0);
    expect(String(payload.lockTime)).toBe("0");
    expect(Number(payload.storageMass), "v0 commits storage mass 0").toBe(0);
    expect("mass" in payload, "no legacy mass field").toBe(false);
  });

  it("D1-V0 a v0 plan that carries a storage mass is still signed committing 0 (the v0 signer never writes the field): same txid", async () => {
    const plan = await fixturePlan();
    const base: any = await signer().signTxPlan({ planArtifact: plan } as any);
    const withMass = { ...plan, storageMass: String(storageMassOf(plan, payloadOf(base))) };
    const again: any = await signer().signTxPlan({ planArtifact: withMass } as any);
    expect(Number(payloadOf(again).storageMass)).toBe(0);
    expect(again.txId).toBe(base.txId);
    // the same transaction field for field (Schnorr signatures carry fresh auxiliary randomness, so only they differ)
    const unsigned = (p: any) => ({ ...p, inputs: p.inputs.map((i: any) => ({ ...i, signatureScript: undefined })) });
    expect(unsigned(payloadOf(again)), "the same signed transaction apart from the signatures").toEqual(unsigned(payloadOf(base)));
  });

  it("D1-V0 the v0 txid does not cover the storage mass: the payload committing HardKAS's computed value has the same id (why the node can set it)", async () => {
    const plan = await fixturePlan();
    const result: any = await signer().signTxPlan({ planArtifact: plan } as any);
    const payload = payloadOf(result);
    const computed = storageMassOf(plan, payload);
    expect(computed).toBeGreaterThan(0n);
    for (const mass of [computed, computed + 1n, 1n]) {
      expect(officialTxIdOf({ ...payload, storageMass: String(mass) }), `storage mass ${mass}`).toBe(result.txId);
    }
  });

  it("D1-V1 v1 commits the plan's storage mass (v0 commits 0); neither id covers the field (official kaspa-wasm 2.1.0): the commitment is what differs", async () => {
    const plan = await fixturePlan();
    const v0: any = await signer().signTxPlan({ planArtifact: plan } as any);
    const computed = storageMassOf(plan, payloadOf(v0));
    // the v1 signer path (the planner refuses v1 payments, L1-05: this is the signer's fixture, as V1-TXID-1's)
    const v1Plan = { ...plan, txVersion: 1, computeBudget: "10", storageMass: String(computed) };
    const v1: any = await signer().signTxPlan({ planArtifact: v1Plan } as any);
    const p1 = payloadOf(v1);
    expect(Number(p1.version)).toBe(1);
    expect(BigInt(p1.storageMass), "v1 commits the plan's storage mass").toBe(computed);
    expect(v1.txId).toBe(officialTxIdOf(p1));
    expect({ txId: v1.txId }).toEqual(V1_PIN);
    expect(v1.txId, "another version, another transaction").not.toBe(v0.txId);
    // measured (R1 evidence 12): the official id covers the storage mass in neither version, so a v0 signed with 0 and the
    // node's mined copy carrying its own value are one txid; what a v1 artifact adds is the committed value itself
    expect(officialTxIdOf({ ...p1, storageMass: String(computed + 1n) }), "the v1 id does not cover the field either").toBe(v1.txId);
  });
});
