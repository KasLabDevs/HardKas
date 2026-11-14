import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { v1StorageMass } from "@hardkas/tx-builder";
import { SimnetNodeHarness, type SimnetNodeHandle } from "../../testing/src/simnet-node-harness.js";
import { buildR0Groth16Scripts, buildR0Groth16Transaction, DEFAULT_ZK_COMPUTE_BUDGET } from "../src/index.js";

/*
 * C-6 (audit 2026-11-13, SUSPECTED) · the output-bound redeem script checks the output count, each output's script and
 * amount, one input and the input limit, but not the outputs' covenant binding. Whoever triggers the spend (anyone with
 * the proof) could declare the bound payout output a covenant genesis authorized by the ZK input: same script, same
 * amount, same count, but the payee's UTXO would then carry a covenant id, which HardKAS payments skip and the v1 engine
 * refuses (COVENANT_P2PK_INPUT_NOT_SUPPORTED). This asks a real rusty-kaspad v2.1.0 (simnet, the isolated harness)
 * whether it accepts such a spend, and records what the payee then holds.
 *
 * Observed 2026-11-13: ACCEPTED; the payee's UTXO carries the genesis covenant id. Griefing, not theft (amount and script
 * are the bound ones). Not bound in the script: that would change the bytes, and so the address, of every output-bound
 * lock already funded (the Testnet-10 evidence included). Documented in ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS instead; this
 * test pins the node's behaviour, so a node that starts refusing it shows here.
 */

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("repo root not found");
}

const PAYOUT = 100_000_000n;

describe("C-6 · an output-bound ZK lock's payout declared as a covenant genesis, on a real rusty-kaspad (simnet)", () => {
  const fixture = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
  const imageId: string = JSON.parse(fs.readFileSync(path.join(fixture, "image-id.json"), "utf8")).imageId;
  const journalHash: string = JSON.parse(fs.readFileSync(path.join(fixture, "journal.json"), "utf8")).journalHash;
  const receiptHex = fs.readFileSync(path.join(fixture, "receipt.hex"), "utf8").trim();
  let node: SimnetNodeHandle;
  let client: JsonWrpcKaspaClient;
  let kaspa: any;
  let minerKey: any;
  let minerAddress: string;
  let minerSpk: any;
  let payeeAddress: string;
  let payeeSpk: any;
  const log = (m: string) => console.log(`[zk-c6] ${m}`);
  const utxosOf = async (address: string): Promise<any[]> => (((await client.call("getUtxosByAddressesRequest", { addresses: [address] })) as any).entries ?? []);

  async function matureMinerUtxo(min: bigint): Promise<any> {
    for (let round = 0; round < 3; round++) {
      const daa = BigInt(((await client.call("getBlockDagInfoRequest", {})) as any).virtualDaaScore);
      const m = (await utxosOf(minerAddress)).filter((e: any) => BigInt(e.utxoEntry.amount) >= min && (!e.utxoEntry.isCoinbase || BigInt(e.utxoEntry.blockDaaScore) + 1000n <= daa));
      if (m.length > 0) return m[0];
      await node.mining.mineBlocks(1005, { payAddress: minerAddress });
    }
    throw new Error("no mature miner UTXO");
  }

  async function fund(p2shAddress: string, amount: bigint): Promise<string> {
    const u = await matureMinerUtxo(amount + 10_000_000n);
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
    expect((await utxosOf(p2shAddress)).find((e: any) => e.outpoint.transactionId === txId && e.outpoint.index === 0), `funding ${txId}`).toBeDefined();
    return txId;
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
  }, 300000);

  afterAll(async () => {
    try {
      await client?.close();
    } finally {
      await node?.kill();
    }
  });

  it("C6-1 the node's verdict on a bound spend whose payout output carries a genesis covenant binding authorized by the ZK input", async () => {
    const scripts = buildR0Groth16Scripts({ imageId, journalHash, receiptHex, bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payeeAddress, amountSompi: PAYOUT } } });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    expect(scripts.consensusEnforced).toBe(true);
    const funding = scripts.requiredFundingSompi!;
    const txId = await fund(scripts.p2shAddresses.simnet, funding);

    // the SDK's own bound spend, then its payout output declared a covenant genesis authorized by input 0 (the ZK input)
    const built = buildR0Groth16Transaction({ scripts, utxo: { transactionId: txId, index: 0, amountSompi: funding }, destinationAddress: payeeAddress, networkId: "simnet" });
    expect(built.ok, JSON.stringify(built.issues)).toBe(true);
    const tx = built.transaction;
    tx.populateGenesisCovenants([{ authorizingInput: 0, outputs: [0] }]);
    tx.storageMass = v1StorageMass(
      [{ amountSompi: funding, scriptBytes: scripts.p2shScriptPublicKey.script.length / 2, covenantId: false }],
      [{ amountSompi: PAYOUT, scriptBytes: String(payeeSpk.script).length / 2, covenantId: true }]
    )!;
    tx.finalize();
    const bound = (tx.serializeToObject().outputs as any[])[0]?.covenant;
    log(`spend ${tx.id}: output 0 binding ${JSON.stringify(bound)}; inputs computeBudget ${DEFAULT_ZK_COMPUTE_BUDGET}; storageMass ${tx.storageMass}`);
    expect(String(bound?.covenantId ?? "")).toMatch(/^[0-9a-f]{64}$/);

    let rejected: string | undefined;
    let accepted: string | undefined;
    try {
      accepted = String(((await client.submitTransaction(tx)) as any).transactionId);
    } catch (e: any) {
      rejected = String(e?.message ?? e);
    }
    log(accepted ? `ACCEPTED ${accepted}` : `REJECTED: ${rejected?.slice(0, 400)}`);
    // the verdict decides C-6: accepted means a public proof can tag the payee's coins with a covenant id
    expect(accepted, `the node rejected it: ${rejected}`).toBeDefined();
    await node.mining.mineBlocks(3, { payAddress: minerAddress });
    const paid = (await utxosOf(payeeAddress)).find((e: any) => e.outpoint.transactionId === accepted);
    log(`payee UTXO: ${JSON.stringify(paid)}`);
    expect(paid, "the payout is in the payee's UTXOs").toBeDefined();
    expect(BigInt(paid.utxoEntry.amount)).toBe(PAYOUT);
    expect(String(paid.utxoEntry.covenantId ?? "")).toMatch(/^[0-9a-f]{64}$/i);
  }, 900000);
});
