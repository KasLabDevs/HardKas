import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import {
  V1_MASS_PARAMS,
  v1FeeMass,
  v1MassShapeOfWasmTransaction,
  v1MinimumRelayFee,
  v1NonContextualMasses,
  v1StorageMass
} from "@hardkas/tx-builder";
import { SimnetNodeHarness, type SimnetNodeHandle } from "../../testing/src/simnet-node-harness.js";
import { buildR0Groth16Scripts, buildR0Groth16Transaction } from "../src/index.js";

/*
 * G1 (notes cross-check) · the node's storage-mass rule, proven on a real rusty-kaspad v2.1.0 (simnet) with PLAIN
 * version-1 transactions (one P2PK input, a small output and the change), before HardKAS's ZK builders stop refusing
 * a spend above 100,000 g of storage mass:
 *  - S150k: storage mass ~150,000 g, fee = the node's relay floor by v1FeeMass / v1MinimumRelayFee (compute and
 *    transient only, ~0.002 KAS): accepted and mined. One sompi less: refused by the node itself.
 *  - S450k: storage mass ~450,000 g at the same floor: accepted and mined.
 *  - S550k: storage mass ~550,000 g (above the block's 500,000): refused by the node.
 * Then the ZK class with HardKAS's own builders (official RISC Zero receipt fixture, no prover):
 *  - an output-bound lock of a 0.05 KAS payout (its funded spend ~159,000 g of storage mass, refused by HardKAS before the
 *    G1 repair) is built, funded with requiredFundingSompi, spent by buildR0Groth16Transaction, accepted and mined;
 *  - proof-only, the node's floor (minimumRelayFeeSompi) is accepted and one sompi less refused;
 *  - a proof-only spend leaving 0.01 KAS (~951,000 g), which HardKAS refuses (ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT), is
 *    refused by the node for its storage mass too.
 * Each verdict is the node's; the test only reports and pins it.
 */

const C = V1_MASS_PARAMS.storageMassParameter; // 10^12
const COMPUTE_BUDGET = 10; // a v1 P2PK input's CheckSig fits in 10 units (109,999 script units)
const log = (m: string) => console.log(`[G1 storage-mass] ${m}`);

let node: SimnetNodeHandle;
let client: JsonWrpcKaspaClient;
let k: any;
let minerKey: any;
let minerAddress: string;
let minerSpk: any;
let payeeAddress: string;
let payeeSpk: any;
const spentByUs = new Set<string>();

const utxosOf = async (address: string): Promise<any[]> =>
  (((await client.call("getUtxosByAddressesRequest", { addresses: [address] })) as any).entries ?? []);

async function matureMinerUtxo(min: bigint): Promise<any> {
  for (let round = 0; round < 3; round++) {
    const dag = (await client.call("getBlockDagInfoRequest", {})) as any;
    const daa = BigInt(dag.virtualDaaScore);
    const m = (await utxosOf(minerAddress)).filter(
      (e: any) =>
        !spentByUs.has(`${e.outpoint.transactionId}:${e.outpoint.index}`) &&
        BigInt(e.utxoEntry.amount) >= min &&
        (!e.utxoEntry.isCoinbase || BigInt(e.utxoEntry.blockDaaScore) + 1000n <= daa)
    );
    if (m.length > 0) {
      const u = m[0];
      spentByUs.add(`${u.outpoint.transactionId}:${u.outpoint.index}`);
      return u;
    }
    await node.mining.mineBlocks(1005, { payAddress: minerAddress });
  }
  throw new Error("no mature miner UTXO");
}

interface Vector {
  tx: any;
  storageMass: bigint;
  computeMass: bigint;
  nodeMinimumFee: bigint;
  fee: bigint;
}

/** A version-1 P2PK spend of `u`: `small` to the payee, the rest minus the fee back to the miner, signed. */
function v1Spend(u: any, small: bigint, feeDelta = 0n): Vector {
  const amount = BigInt(u.utxoEntry.amount);
  const make = (sigScript: string, fee: bigint) => {
    const tx = new k.Transaction({
      version: 1,
      inputs: [
        {
          previousOutpoint: u.outpoint,
          signatureScript: sigScript,
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: COMPUTE_BUDGET,
          utxo: {
            outpoint: u.outpoint,
            amount,
            scriptPublicKey: new k.ScriptPublicKey(0, u.utxoEntry.scriptPublicKey.slice(4)),
            blockDaaScore: BigInt(u.utxoEntry.blockDaaScore),
            isCoinbase: Boolean(u.utxoEntry.isCoinbase)
          }
        }
      ],
      outputs: [
        { value: small, scriptPublicKey: new k.ScriptPublicKey(payeeSpk.version, payeeSpk.script) },
        { value: amount - small - fee, scriptPublicKey: new k.ScriptPublicKey(minerSpk.version, minerSpk.script) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "",
      storageMass: 0n
    });
    const storage = v1StorageMass(
      [{ amountSompi: amount, scriptBytes: 34, covenantId: false }],
      [
        { amountSompi: small, scriptBytes: 34, covenantId: false },
        { amountSompi: amount - small - fee, scriptBytes: 34, covenantId: false }
      ]
    );
    if (storage === undefined) throw new Error("storage mass overflow");
    tx.storageMass = storage;
    return { tx, storage };
  };
  // the mass does not depend on the fee (8-byte value); measure it with a signature script of its final length (66 bytes)
  const probe = make("41" + "00".repeat(65), 0n).tx;
  const masses = v1NonContextualMasses(v1MassShapeOfWasmTransaction(probe));
  const nodeMinimumFee = v1MinimumRelayFee(v1FeeMass(masses));
  const fee = nodeMinimumFee + feeDelta;
  const unsigned = make("", fee).tx;
  const sig = String(k.createInputSignature(unsigned, 0, minerKey, k.SighashType.All));
  const { tx, storage } = make(sig, fee);
  tx.finalize();
  return { tx, storageMass: storage, computeMass: masses.computeMass, nodeMinimumFee, fee };
}

async function submit(label: string, v: Vector): Promise<{ accepted: boolean; reason: string; txId: string }> {
  try {
    const res = (await client.submitTransaction(v.tx)) as any;
    log(`${label}: ACCEPTED txId=${res.transactionId} storageMass=${v.storageMass} computeMass=${v.computeMass} fee=${v.fee} (node floor ${v.nodeMinimumFee})`);
    return { accepted: true, reason: "", txId: String(res.transactionId) };
  } catch (e: any) {
    const reason = String(e?.message ?? e);
    log(`${label}: REFUSED storageMass=${v.storageMass} fee=${v.fee}: ${reason.slice(0, 300)}`);
    return { accepted: false, reason, txId: String(v.tx.id) };
  }
}

async function minedTo(address: string, txId: string): Promise<boolean> {
  return (await utxosOf(address)).some((e: any) => e.outpoint.transactionId === txId);
}

beforeAll(async () => {
  node = await SimnetNodeHarness.start({ utxoIndex: true });
  await node.waitUntilReady();
  if (node.simulated === true) throw new Error("real kaspad required");
  client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });
  k = loadManagedKaspaWasmSync();
  minerKey = new k.PrivateKey("5a".repeat(32));
  minerAddress = minerKey.toAddress("simnet").toString();
  minerSpk = k.payToAddressScript(new k.Address(minerAddress));
  payeeAddress = new k.PrivateKey("5b".repeat(32)).toAddress("simnet").toString();
  payeeSpk = k.payToAddressScript(new k.Address(payeeAddress));
}, 300000);

afterAll(async () => {
  try {
    await client?.close();
  } finally {
    await node?.kill();
  }
});

describe("G1 · the node's storage-mass rule for a plain version-1 transaction (rusty-kaspad 2.1.0, simnet)", () => {
  it("storage mass above 100,000 g is relayed and mined at the compute/transient floor; above the block's 500,000 it is refused", async () => {
    try {
      const info = (await client.call("getServerInfoRequest", {})) as any;
      log(`node ${info?.serverVersion} ${info?.networkId}`);
    } catch {
      /* informational only */
    }

    // S150k: C / 6,666,667 = 149,999 g (+ the change's term, - the input's)
    const s150 = v1Spend(await matureMinerUtxo(10n * 100_000_000n), 6_666_667n);
    expect(s150.storageMass).toBeGreaterThan(100_000n);
    expect(s150.storageMass).toBeLessThan(160_000n);
    // the floor the node is expected to apply is priced on compute/transient mass only: far below storage × 100
    expect(s150.nodeMinimumFee * 10n).toBeLessThan(s150.storageMass * 100n);
    // one sompi under that floor, same shape (another coin): the node refuses it for its fee
    const under = v1Spend(await matureMinerUtxo(10n * 100_000_000n), 6_666_667n, -1n);
    const underRes = await submit("S150k fee floor - 1", under);
    expect(underRes.accepted).toBe(false);
    expect(underRes.reason).toMatch(/under the required amount|fee/i);
    const r150 = await submit("S150k at the floor", s150);
    expect(r150.accepted, r150.reason).toBe(true);

    // S450k: C / 2,222,223 = 449,999 g
    const s450 = v1Spend(await matureMinerUtxo(10n * 100_000_000n), 2_222_223n);
    expect(s450.storageMass).toBeGreaterThan(440_000n);
    expect(s450.storageMass).toBeLessThanOrEqual(V1_MASS_PARAMS.blockLimits.storage);
    const r450 = await submit("S450k at the floor", s450);
    expect(r450.accepted, r450.reason).toBe(true);

    // S550k: C / 1,818,181 = 550,000 g, above the block storage limit
    const s550 = v1Spend(await matureMinerUtxo(10n * 100_000_000n), 1_818_181n);
    expect(s550.storageMass).toBeGreaterThan(V1_MASS_PARAMS.blockLimits.storage);
    const r550 = await submit("S550k at the floor", s550);
    expect(r550.accepted).toBe(false);
    expect(r550.reason).not.toMatch(/under the required amount/i);

    // both accepted spends are mined (each block holds at most 500,000 g of storage mass: they need two blocks)
    for (let i = 0; i < 6 && !((await minedTo(payeeAddress, r150.txId)) && (await minedTo(payeeAddress, r450.txId))); i++) {
      await node.mining.mineBlocks(1, { payAddress: minerAddress });
    }
    expect(await minedTo(payeeAddress, r150.txId), "S150k mined").toBe(true);
    expect(await minedTo(payeeAddress, r450.txId), "S450k mined").toBe(true);
    log(`RESULT mempool storage limit is the block's ${V1_MASS_PARAMS.blockLimits.storage} (not 100,000); floor = v1MinimumRelayFee(v1FeeMass) = ${s150.nodeMinimumFee} for compute mass ${s150.computeMass}`);
  }, 900000);
});

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("repo root not found");
}

describe("G1 · the same rules for a ZK spend built by HardKAS (official RISC Zero receipt, simnet)", () => {
  it("a 0.05 KAS output-bound payout is spent and mined; proof-only the floor is exact; a 0.01 KAS payout is refused by HardKAS and by the node", async () => {
    const fixture = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
    const imageId: string = JSON.parse(fs.readFileSync(path.join(fixture, "image-id.json"), "utf8")).imageId;
    const journalHash: string = JSON.parse(fs.readFileSync(path.join(fixture, "journal.json"), "utf8")).journalHash;
    const receiptHex = fs.readFileSync(path.join(fixture, "receipt.hex"), "utf8").trim();
    const PAYOUT = 5_000_000n; // 0.05 KAS
    const boundScripts = buildR0Groth16Scripts({
      imageId,
      journalHash,
      receiptHex,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payeeAddress, amountSompi: PAYOUT } }
    });
    expect(boundScripts.ok, JSON.stringify(boundScripts.issues)).toBe(true);
    expect(boundScripts.spendStorageMass! > 100_000n).toBe(true);
    const proofOnly = buildR0Groth16Scripts({ imageId, journalHash, receiptHex });
    expect(proofOnly.ok, JSON.stringify(proofOnly.issues)).toBe(true);
    const probe = buildR0Groth16Transaction({
      scripts: proofOnly,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 100_000_000n },
      destinationAddress: payeeAddress,
      networkId: "simnet"
    });
    const floor = probe.minimumRelayFeeSompi!;
    const recommended = probe.feeSompi;
    log(`ZK bound lock requiredFunding=${boundScripts.requiredFundingSompi} spendStorageMass=${boundScripts.spendStorageMass}; proof-only floor=${floor} (node compute ${probe.nodeComputeMass}) recommended=${recommended}`);

    // one funding transaction: 0 = the bound lock's requiredFunding, 1 = 1 KAS proof-only, 2 = 0.01 KAS + fee proof-only
    const amounts = [boundScripts.requiredFundingSompi!, 100_000_000n, 1_000_000n + recommended];
    const u = await matureMinerUtxo(10n * 100_000_000n);
    const spkOf = (s: any) => new k.ScriptPublicKey(s.p2shScriptPublicKey.version, s.p2shScriptPublicKey.script);
    const fundingFee = 2_000_000n;
    const funding = new k.Transaction({
      version: 0,
      inputs: [{
        previousOutpoint: u.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 1,
        utxo: { outpoint: u.outpoint, amount: BigInt(u.utxoEntry.amount), scriptPublicKey: new k.ScriptPublicKey(0, u.utxoEntry.scriptPublicKey.slice(4)), blockDaaScore: BigInt(u.utxoEntry.blockDaaScore), isCoinbase: Boolean(u.utxoEntry.isCoinbase) }
      }],
      outputs: [
        { value: amounts[0]!, scriptPublicKey: spkOf(boundScripts) },
        { value: amounts[1]!, scriptPublicKey: spkOf(proofOnly) },
        { value: amounts[2]!, scriptPublicKey: spkOf(proofOnly) },
        { value: BigInt(u.utxoEntry.amount) - amounts.reduce((s, a) => s + a, 0n) - fundingFee, scriptPublicKey: new k.ScriptPublicKey(minerSpk.version, minerSpk.script) }
      ],
      lockTime: 0n, subnetworkId: "00".repeat(20), gas: 0n, payload: "", storageMass: 0n
    });
    const fundRes = (await client.submitTransaction(k.signTransaction(funding, [minerKey], true))) as any;
    const fundTxId = String(fundRes.transactionId);
    await node.mining.mineBlocks(3, { payAddress: minerAddress });
    log(`funding ${fundTxId}`);

    // 1. the output-bound 0.05 KAS payout: HardKAS's own spend, accepted and mined, the payee gets exactly 0.05 KAS
    const boundSpend = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: { transactionId: fundTxId, index: 0, amountSompi: amounts[0]! },
      destinationAddress: payeeAddress,
      networkId: "simnet"
    });
    expect(boundSpend.ok, JSON.stringify(boundSpend.issues)).toBe(true);
    expect(boundSpend.storageMass).toBe(boundScripts.spendStorageMass);
    const rb = await submit("ZK bound 0.05 KAS", { tx: boundSpend.transaction, storageMass: boundSpend.storageMass!, computeMass: boundSpend.nodeComputeMass!, nodeMinimumFee: boundSpend.minimumRelayFeeSompi!, fee: boundSpend.feeSompi });
    expect(rb.accepted, rb.reason).toBe(true);

    // 2. proof-only at the node's floor - 1 (HardKAS warns), then at the floor: refused, then accepted
    const at = (fee: bigint) =>
      buildR0Groth16Transaction({ scripts: proofOnly, utxo: { transactionId: fundTxId, index: 1, amountSompi: amounts[1]! }, destinationAddress: payeeAddress, feeSompi: fee, networkId: "simnet" });
    const under = at(floor - 1n);
    expect(under.warnings.map((w) => w.code)).toContain("ZK_FEE_BELOW_MEMPOOL_MINIMUM");
    const ru = await submit("ZK proof-only floor - 1", { tx: under.transaction, storageMass: under.storageMass!, computeMass: under.nodeComputeMass!, nodeMinimumFee: floor, fee: floor - 1n });
    expect(ru.accepted).toBe(false);
    expect(ru.reason).toMatch(/under the required amount/i);
    const exact = at(floor);
    expect(exact.ok, JSON.stringify(exact.issues)).toBe(true);
    expect(exact.warnings.map((w) => w.code)).not.toContain("ZK_FEE_BELOW_MEMPOOL_MINIMUM");
    const re = await submit("ZK proof-only at the floor", { tx: exact.transaction, storageMass: exact.storageMass!, computeMass: exact.nodeComputeMass!, nodeMinimumFee: floor, fee: floor });
    expect(re.accepted, re.reason).toBe(true);

    // 3. proof-only leaving 0.01 KAS: refused by HardKAS; the transaction it describes is refused by the node for its storage mass
    const tiny = buildR0Groth16Transaction({ scripts: proofOnly, utxo: { transactionId: fundTxId, index: 2, amountSompi: amounts[2]! }, destinationAddress: payeeAddress, networkId: "simnet" });
    expect(tiny.ok).toBe(false);
    expect(tiny.issues.map((i) => i.code)).toEqual(["ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT"]);
    const rt = await submit("ZK proof-only 0.01 KAS", { tx: tiny.transaction, storageMass: tiny.storageMass!, computeMass: tiny.nodeComputeMass!, nodeMinimumFee: floor, fee: tiny.feeSompi });
    expect(rt.accepted).toBe(false);
    expect(rt.reason).toMatch(/storage mass of \d+ is larger than max allowed size of 500000/);

    for (let i = 0; i < 6 && !((await minedTo(payeeAddress, rb.txId)) && (await minedTo(payeeAddress, re.txId))); i++) {
      await node.mining.mineBlocks(1, { payAddress: minerAddress });
    }
    const paid = (await utxosOf(payeeAddress)).find((e: any) => e.outpoint.transactionId === rb.txId);
    expect(paid, "bound payout mined").toBeDefined();
    expect(BigInt(paid.utxoEntry.amount)).toBe(PAYOUT);
    expect(await minedTo(payeeAddress, re.txId), "proof-only floor spend mined").toBe(true);
  }, 900000);
});
