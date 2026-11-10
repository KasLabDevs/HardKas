import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import {
  calculateUpstreamStorageMass,
  planPaymentWithGenerator,
  v1FeeMass,
  v1MinimumRelayFee,
  v1NonContextualMasses,
  type Utxo
} from "@hardkas/tx-builder";
import { parseWasmTxToRpc } from "@hardkas/accounts";
import { getHardkasFixtureKey } from "../src/fixture-signer.js";
import {
  fundTestAccount,
  mineBlocks,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  waitForTransaction,
  type IsolatedSimnetSession,
  type SimnetOnChainUtxo
} from "../src/isolated-simnet.js";

/*
 * HK-09 / CA-TX-03 · regression on a real rusty-kaspad v2.1.0 (simnet). Before the repair a 0.2 KAS payment paid
 * 5,000,000 sompi (0.05 KAS): HardKAS handed the Generator feeRate = 100 sompi/g and the Generator charged it on the
 * storage mass (C / 0.2 KAS = 50,000 g). The node's relay minimum is priced on max(compute, normalized transient) mass
 * only (mining/src/mempool/check_transaction_standard.rs). The product planner (planPaymentWithGenerator) must now pay
 * the minimum, the node must accept it, and one sompi less than the node's minimum must be refused by the node.
 */

const KAS = 100_000_000n;
const PAYMENT = KAS / 5n; // 0.2 KAS
const OLD_FEE = 5_000_000n; // 0.05 KAS: what the 0.2 KAS payment paid before the repair
const ZERO_SUBNET = "0000000000000000000000000000000000000000";

let k: any;
let session: IsolatedSimnetSession;
let alice: { key: string; address: string };
let bob: string;
let funding: SimnetOnChainUtxo;

const submit = async (rpcTx: unknown): Promise<{ accepted: boolean; reason: string; txId?: string }> => {
  try {
    const res: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false });
    return { accepted: res?.accepted !== false, reason: String(res?.error ?? ""), ...(res?.transactionId ? { txId: String(res.transactionId) } : {}) };
  } catch (e: any) {
    return { accepted: false, reason: String(e?.message ?? e) };
  }
};

/** One P2PK input, payment + change, signed with kaspa-wasm (the official signer). */
const buildSigned = (paymentSompi: bigint, changeSompi: bigint): any => {
  const key = new k.PrivateKey(alice.key);
  const make = (sigScript: string) => {
    const tx = new k.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: funding.outpoint,
          signatureScript: sigScript,
          sequence: 0n,
          sigOpCount: 1,
          utxo: {
            outpoint: funding.outpoint,
            amount: funding.amountSompi,
            scriptPublicKey: new k.ScriptPublicKey(funding.scriptPublicKey.version, funding.scriptPublicKey.script),
            blockDaaScore: funding.blockDaaScore,
            isCoinbase: funding.isCoinbase
          }
        }
      ],
      outputs: [
        { value: paymentSompi, scriptPublicKey: k.payToAddressScript(new k.Address(bob)) },
        { value: changeSompi, scriptPublicKey: k.payToAddressScript(new k.Address(alice.address)) }
      ],
      lockTime: 0n,
      subnetworkId: ZERO_SUBNET,
      gas: 0n,
      payload: ""
    });
    // v0, standard P2PK cells only: plurality 1 everywhere, so the amounts-only storage mass is the node's
    tx.storageMass = calculateUpstreamStorageMass([funding.amountSompi], [paymentSompi, changeSompi], "simnet");
    tx.finalize();
    return tx;
  };
  const sig = String(k.createInputSignature(make(""), 0, key, k.SighashType.All));
  return make(sig);
};

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  const aliceKey = getHardkasFixtureKey("alice");
  alice = { key: aliceKey, address: String(new k.PrivateKey(aliceKey).toPublicKey().toAddress("simnet").toString()) };
  bob = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
  funding = await fundTestAccount(session, "alice", 10n * KAS);
});

afterAll(async () => {
  if (session) await stopIsolatedSimnet(session);
});

describe("HK-09 / CA-TX-03 · a 0.2 KAS payment pays the relay minimum on a real rusty-kaspad", () => {
  it("the product planner prices it at the node's minimum (not 0.05 KAS); the node refuses one sompi less and accepts the plan", async () => {
    const utxo: Utxo = {
      outpoint: funding.outpoint,
      address: alice.address,
      amountSompi: funding.amountSompi,
      scriptPublicKey: funding.scriptPublicKey.script,
      blockDaaScore: funding.blockDaaScore,
      isCoinbase: funding.isCoinbase
    };
    const plan = await planPaymentWithGenerator({
      networkId: "simnet",
      utxos: [utxo],
      outputs: [{ address: bob, amountSompi: PAYMENT }],
      changeAddress: alice.address
    });
    const fee = plan.estimatedFeeSompi;
    const change = plan.change?.amountSompi ?? 0n;
    expect(plan.inputs).toHaveLength(1);
    expect(change + fee + PAYMENT).toBe(funding.amountSompi);
    expect(fee).toBeLessThan(OLD_FEE);

    // The node's relay minimum for this shape (1 P2PK input, 2 P2PK outputs, v0), by the node's formula
    const nodeMinimum = v1MinimumRelayFee(
      v1FeeMass(
        v1NonContextualMasses({
          version: 0,
          inputs: [{ signatureScriptBytes: 66, sigOpCount: 1 }],
          outputs: [{ scriptBytes: 34, covenant: false }, { scriptBytes: 34, covenant: false }],
          payloadBytes: 0
        })
      )
    );
    expect(fee).toBeGreaterThanOrEqual(nodeMinimum);
    // the storage mass of this shape is far above the compute mass: the old pricing charged it
    const storage = BigInt(calculateUpstreamStorageMass([funding.amountSompi], [PAYMENT, change], "simnet"));
    expect(storage * 100n).toBeGreaterThanOrEqual(OLD_FEE);

    // One sompi under the node's minimum: the node itself refuses it (it is the node's floor, not HardKAS's)
    const under = await submit(parseWasmTxToRpc(buildSigned(PAYMENT, funding.amountSompi - PAYMENT - (nodeMinimum - 1n)).serializeToObject()));
    console.log(`[HK-09] under-minimum (fee ${nodeMinimum - 1n}): accepted=${under.accepted} reason=${under.reason.slice(0, 200)}`);
    expect(under.accepted).toBe(false);
    expect(under.reason).toMatch(/under the required amount|fee/i);

    // The plan as planned: accepted by the node and confirmed in a block
    const signed = buildSigned(PAYMENT, change);
    const ok = await submit(parseWasmTxToRpc(signed.serializeToObject()));
    console.log(`[HK-09] plan (fee ${fee}, node minimum ${nodeMinimum}, storage mass ${storage}): accepted=${ok.accepted} txId=${ok.txId ?? ""} ${ok.reason}`);
    expect(ok.accepted, ok.reason).toBe(true);
    await mineBlocks(session, 1);
    const outs = await waitForTransaction(session, bob, String(signed.id));
    expect(outs.map((o) => o.amountSompi)).toContain(PAYMENT);
  });
});
