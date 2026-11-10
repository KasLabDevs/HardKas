import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { SimnetNodeHarness, type SimnetNodeHandle } from "../../testing/src/simnet-node-harness.js";
import {
  buildR0Groth16Scripts,
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  DEFAULT_ZK_COMPUTE_BUDGET
} from "../src/index.js";

/*
 * ZK-16 + the output-bound repair, on a real rusty-kaspad v2.1.0 (simnet): the SDK's OWN builders
 * (buildR0Groth16Scripts / buildR0Groth16Transaction) end to end, with the official RISC Zero receipt.
 * - proof-only: the SDK transaction is accepted and pays out.
 * - proof-and-output-bound: the redeem script binds the payout by introspection (version-prefixed SPK), one input,
 *   and an input limit. The node accepts the bound spend, and rejects wrong outputs, two inputs at once and an
 *   input above the limit. Before the repair the bound SPK lacked its version, so no spend could ever match.
 */

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("repo root not found");
}

const imageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const journalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
const PAYOUT = 100_000_000n;

describe("ZK output-bound locks and the SDK transaction builder on a real rusty-kaspad (simnet)", () => {
  let node: SimnetNodeHandle;
  let client: JsonWrpcKaspaClient;
  let kaspa: any;
  let minerKey: any;
  let minerAddress: string;
  let minerSpk: any;
  let payeeAddress: string;
  let payeeSpk: any;
  let receiptHex: string;

  const log = (m: string) => console.log(`[zk-output-bound] ${m}`);
  const utxosOf = async (address: string): Promise<any[]> =>
    (((await client.call("getUtxosByAddressesRequest", { addresses: [address] })) as any).entries ?? []);

  async function matureMinerUtxo(min: bigint): Promise<any> {
    for (let round = 0; round < 3; round++) {
      const dag = (await client.call("getBlockDagInfoRequest", {})) as any;
      const daa = BigInt(dag.virtualDaaScore);
      const used = new Set(spentByUs);
      const m = (await utxosOf(minerAddress)).filter(
        (e: any) =>
          !used.has(`${e.outpoint.transactionId}:${e.outpoint.index}`) &&
          BigInt(e.utxoEntry.amount) >= min &&
          (!e.utxoEntry.isCoinbase || BigInt(e.utxoEntry.blockDaaScore) + 1000n <= daa)
      );
      if (m.length > 0) return m[0];
      await node.mining.mineBlocks(1005, { payAddress: minerAddress });
    }
    throw new Error("no mature miner UTXO");
  }
  const spentByUs: string[] = [];

  /** Locks `amount` at `p2shAddress` from a mature miner UTXO; returns the funding txid (output 0). */
  async function fund(p2shAddress: string, amount: bigint): Promise<string> {
    const u = await matureMinerUtxo(amount + 10_000_000n);
    spentByUs.push(`${u.outpoint.transactionId}:${u.outpoint.index}`);
    const p2shSpk = kaspa.payToAddressScript(new kaspa.Address(p2shAddress));
    const fee = 1_000_000n;
    const tx = new kaspa.Transaction({
      version: 0,
      inputs: [{
        previousOutpoint: u.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 1,
        utxo: { outpoint: u.outpoint, amount: BigInt(u.utxoEntry.amount), scriptPublicKey: new kaspa.ScriptPublicKey(0, u.utxoEntry.scriptPublicKey.slice(4)), blockDaaScore: BigInt(u.utxoEntry.blockDaaScore), isCoinbase: u.utxoEntry.isCoinbase }
      }],
      outputs: [
        { value: amount, scriptPublicKey: new kaspa.ScriptPublicKey(p2shSpk.version, p2shSpk.script) },
        { value: BigInt(u.utxoEntry.amount) - amount - fee, scriptPublicKey: new kaspa.ScriptPublicKey(minerSpk.version, minerSpk.script) }
      ],
      lockTime: 0n, subnetworkId: "00".repeat(20), gas: 0n, payload: "", storageMass: 0n
    });
    const res = (await client.submitTransaction(kaspa.signTransaction(tx, [minerKey], true))) as any;
    await node.mining.mineBlocks(3, { payAddress: minerAddress });
    const txId = String(res.transactionId);
    const seen = (await utxosOf(p2shAddress)).find((e: any) => e.outpoint.transactionId === txId && e.outpoint.index === 0);
    expect(seen, `funding ${txId} observed at the P2SH`).toBeDefined();
    return txId;
  }

  /** A hand-made spend of P2SH UTXOs with the given outputs (to test what the node refuses). */
  function manualSpend(scripts: any, inputs: Array<{ txId: string; amount: bigint }>, outputs: Array<{ spk: any; value: bigint }>) {
    return new kaspa.Transaction({
      version: 1,
      inputs: inputs.map((i) => ({
        previousOutpoint: { transactionId: i.txId, index: 0 }, signatureScript: scripts.sigScript, sequence: 0n, sigOpCount: 0,
        computeBudget: DEFAULT_ZK_COMPUTE_BUDGET,
        utxo: { outpoint: { transactionId: i.txId, index: 0 }, amount: i.amount, scriptPublicKey: new kaspa.ScriptPublicKey(scripts.p2shScriptPublicKey.version, scripts.p2shScriptPublicKey.script), blockDaaScore: 0n, isCoinbase: false }
      })),
      outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: new kaspa.ScriptPublicKey(o.spk.version, o.spk.script) })),
      lockTime: 0n, subnetworkId: "00".repeat(20), gas: 0n, payload: "", storageMass: 0n
    });
  }

  async function expectNodeRejects(label: string, tx: any): Promise<string> {
    let err: string | undefined;
    try {
      await client.submitTransaction(tx);
    } catch (e: any) {
      err = String(e?.message ?? e);
    }
    log(`${label}: ${err === undefined ? "ACCEPTED (unexpected)" : "rejected: " + err.slice(0, 220)}`);
    expect(err, `${label}: the node accepted a spend it must reject`).toBeDefined();
    // a script failure, never a parse/orphan/fee problem of the test itself
    expect(err!).not.toMatch(/orphan|under the required amount|deserializ/i);
    return err!;
  }

  beforeAll(async () => {
    node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    if (node.simulated === true) throw new Error("real kaspad required");
    client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });
    kaspa = loadManagedKaspaWasmSync();
    minerKey = new kaspa.PrivateKey("33".repeat(32));
    minerAddress = minerKey.toAddress("simnet").toString();
    minerSpk = kaspa.payToAddressScript(new kaspa.Address(minerAddress));
    payeeAddress = new kaspa.PrivateKey("44".repeat(32)).toAddress("simnet").toString();
    payeeSpk = kaspa.payToAddressScript(new kaspa.Address(payeeAddress));
    receiptHex = fs.readFileSync(path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official", "receipt.hex"), "utf8").trim();
  }, 300000);

  afterAll(async () => {
    try {
      await client?.close();
    } finally {
      await node?.kill();
    }
  });

  it("proof-only (ZK-16): the SDK's own transaction builder produces a spend the node accepts", async () => {
    const scripts = buildR0Groth16Scripts({ imageId, journalHash, receiptHex });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    expect(scripts.authorizationModel).toBe("IMAGE_ID_ONLY");
    expect(scripts.consensusEnforced).toBe(false);
    const amount = 200_000_000n;
    const txId = await fund(scripts.p2shAddresses.simnet, amount);
    const built = buildR0Groth16Transaction({ scripts, utxo: { transactionId: txId, index: 0, amountSompi: amount }, destinationAddress: minerAddress, networkId: "simnet" });
    expect(built.ok, JSON.stringify(built.issues)).toBe(true);
    const res = (await client.submitTransaction(built.transaction)) as any;
    await node.mining.mineBlocks(3, { payAddress: minerAddress });
    const payout = (await utxosOf(minerAddress)).find((e: any) => e.outpoint.transactionId === String(res.transactionId));
    log(`proof-only spend ${res.transactionId} fee ${built.feeSompi} payout ${payout?.utxoEntry?.amount}`);
    expect(payout).toBeDefined();
    expect(BigInt(payout.utxoEntry.amount)).toBe(amount - built.feeSompi);
  }, 600000);

  it("proof-and-output-bound: the node rejects wrong outputs, two inputs and an input above the limit, and accepts the bound spend", async () => {
    const scripts = buildR0Groth16Scripts({
      imageId,
      journalHash,
      receiptHex,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payeeAddress, amountSompi: PAYOUT } }
    });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    expect(scripts.authorizationModel).toBe("IMAGE_ID_AND_OUTPUTS");
    expect(scripts.consensusEnforced).toBe(true);
    expect(scripts.warnings.map((w) => w.code)).toContain("ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS");
    const structural = verifyR0Groth16Scripts({ redeemScript: scripts.redeemScript, sigScript: scripts.sigScript, expectedBindingMode: "proof-and-output-bound", expectedPayoutAddress: payeeAddress, expectedPayoutAmount: PAYOUT });
    expect(structural.ok, JSON.stringify(structural.issues)).toBe(true);
    expect(structural.consensusEnforced).toBe(true);
    const funding = scripts.requiredFundingSompi!;
    expect(funding).toBeGreaterThan(PAYOUT);
    const maxInput = scripts.maxInputSompi!;
    const p2sh = scripts.p2shAddresses.simnet;
    log(`bound lock ${p2sh}: requiredFunding ${funding} maxInput ${maxInput}`);

    const a = await fund(p2sh, funding);
    const b = await fund(p2sh, funding);
    const big = await fund(p2sh, maxInput + 1n);

    // 1. right amounts, wrong payee: the SPK check fails
    await expectNodeRejects("wrong_payout_script", manualSpend(scripts, [{ txId: a, amount: funding }], [{ spk: minerSpk, value: PAYOUT }]));
    // 2. right payee, wrong amount
    await expectNodeRejects("wrong_payout_amount", manualSpend(scripts, [{ txId: a, amount: funding }], [{ spk: payeeSpk, value: PAYOUT - 1n }]));
    // 3. two UTXOs of the lock in one spend: the one-input rule fails (the excess would have gone to the fee)
    await expectNodeRejects("two_inputs", manualSpend(scripts, [{ txId: a, amount: funding }, { txId: b, amount: funding }], [{ spk: payeeSpk, value: PAYOUT }]));
    // 4. a UTXO above the limit stays locked
    const tooBig = buildR0Groth16Transaction({ scripts, utxo: { transactionId: big, index: 0, amountSompi: maxInput + 1n }, destinationAddress: payeeAddress, networkId: "simnet" });
    expect(tooBig.ok).toBe(false);
    expect(tooBig.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["ZK_BOUND_INPUT_ABOVE_LOCK_LIMIT"]));
    await expectNodeRejects("input_above_limit", manualSpend(scripts, [{ txId: big, amount: maxInput + 1n }], [{ spk: payeeSpk, value: PAYOUT }]));

    // 5. the SDK's bound spend: accepted, pays exactly the bound payout
    const built = buildR0Groth16Transaction({ scripts, utxo: { transactionId: a, index: 0, amountSompi: funding }, destinationAddress: payeeAddress, networkId: "simnet" });
    expect(built.ok, JSON.stringify(built.issues)).toBe(true);
    expect(built.consensusEnforced).toBe(true);
    const planOutputs = (built.planArtifact as any)?.outputs ?? [];
    expect(planOutputs).toEqual([expect.objectContaining({ address: payeeAddress, amountSompi: String(PAYOUT), role: "payment" })]);
    expect(String((built.planArtifact as any)?.estimatedFeeSompi)).toBe(String(funding - PAYOUT));
    const res = (await client.submitTransaction(built.transaction)) as any;
    await node.mining.mineBlocks(3, { payAddress: minerAddress });
    const paid = (await utxosOf(payeeAddress)).find((e: any) => e.outpoint.transactionId === String(res.transactionId));
    log(`bound spend ${res.transactionId} fee ${built.feeSompi} payee received ${paid?.utxoEntry?.amount}`);
    expect(paid).toBeDefined();
    expect(BigInt(paid.utxoEntry.amount)).toBe(PAYOUT);
    expect((await utxosOf(p2sh)).some((e: any) => e.outpoint.transactionId === a)).toBe(false);
  }, 900000);
});
