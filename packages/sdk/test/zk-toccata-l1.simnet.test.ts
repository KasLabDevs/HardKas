import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { HardkasSchemas, ZkExecutionEvidenceSchema, type ZkExecutionEvidenceType } from "@hardkas/artifacts";
import { SimnetNodeHarness, type SimnetNodeHandle } from "../../testing/src/simnet-node-harness.js";
import { buildR0Groth16Scripts, DEFAULT_ZK_COMPUTE_BUDGET, HISTORICAL_TRIAL_ZK_FEE_SOMPI } from "../src/index.js";

/**
 * Simnet level (L3), run only through `vitest.simnet.config.ts`: the harness raises its OWN kaspad
 * in Docker, labelled with the run id, and removes it on teardown. This suite never attaches to a
 * node that happens to listen on a well-known port (audit H-02).
 *
 * Every node answer, positive or negative, is recorded in a ZkExecutionEvidence artifact written to
 * HARDKAS_ZK_EVIDENCE_DIR (or the OS temp dir). The artifact is the evidence; this file's assertions
 * only say whether the run matched the expectations HardKAS documents.
 */
function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

const officialImageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const officialJournalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";

describe("ZK L1 end-to-end on a harness-managed simnet node (KIP-16 OpZkPrecompile)", () => {
  let node: SimnetNodeHandle;
  let client: JsonWrpcKaspaClient;
  let kaspa: ReturnType<typeof loadManagedKaspaWasmSync>;
  let minerPrivateKey: any;
  let minerAddress: string;
  let minerSpk: any;
  let zkScripts: ReturnType<typeof buildR0Groth16Scripts>;
  let p2shAddress: string;
  let serverVersion = "unknown";

  const evidence: ZkExecutionEvidenceType = {
    schema: HardkasSchemas.ZkExecutionEvidenceV1,
    networkId: "simnet",
    node: { rpcUrl: "", serverVersion: "unknown", source: "simnet-harness", harnessRunId: process.env.HARDKAS_TEST_RUN_ID },
    precompile: { opcode: "0xa6", opcodeName: "OpZkPrecompile", tag: "0x20", curve: "BN254", provingSystem: "Groth16" },
    guestSystem: "RISC Zero",
    imageId: officialImageId,
    journalHash: officialJournalHash,
    p2shAddress: "",
    redeemScriptHash: "",
    funding: { txId: "", outputIndex: 0, amountSompi: "200000000", accepted: false, utxoObserved: false },
    spend: {
      computeBudget: DEFAULT_ZK_COMPUTE_BUDGET,
      feeSompi: HISTORICAL_TRIAL_ZK_FEE_SOMPI.toString(),
      payoutAddress: "",
      payoutSompi: "180000000",
      accepted: false,
      payoutUtxoObserved: false
    },
    negativeCases: [],
    outcome: "DEVIATIONS",
    timestamp: new Date().toISOString(),
    notes: []
  };

  function writeEvidence(): string {
    const dir = process.env.HARDKAS_ZK_EVIDENCE_DIR ?? os.tmpdir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `zk-execution-evidence-${Date.now()}.json`);
    const allExpected =
      evidence.funding.accepted &&
      evidence.spend.accepted &&
      evidence.spend.payoutUtxoObserved &&
      evidence.negativeCases.length > 0 &&
      evidence.negativeCases.every((c) => c.rejected && c.matchedExpectedPattern);
    evidence.outcome = allExpected ? "ALL_AS_EXPECTED" : "DEVIATIONS";
    evidence.timestamp = new Date().toISOString();
    const parsed = ZkExecutionEvidenceSchema.safeParse(evidence);
    if (!parsed.success) throw new Error(`evidence does not match its schema: ${parsed.error.message}`);
    fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
    console.log(`[zk-toccata-l1.simnet] evidence written to ${file}`);
    return file;
  }

  async function utxosOf(address: string): Promise<any[]> {
    const res = (await client.call("getUtxosByAddressesRequest", { addresses: [address] })) as any;
    return res.entries ?? [];
  }

  async function getMatureMinerUtxo(): Promise<any> {
    for (let round = 0; round < 3; round++) {
      const dag = (await client.call("getBlockDagInfoRequest", {})) as any;
      const currentDaa = BigInt(dag.virtualDaaScore);
      const mature = (await utxosOf(minerAddress)).filter((e: any) => {
        if (BigInt(e.utxoEntry.amount) < 500000000n) return false;
        if (!e.utxoEntry.isCoinbase) return true;
        return BigInt(e.utxoEntry.blockDaaScore) + 1000n <= currentDaa;
      });
      if (mature.length > 0) return mature[0];
      await node.mining.mineBlocks(1005, { payAddress: minerAddress });
    }
    throw new Error("no mature miner UTXO after mining");
  }

  function spendTx(targetUtxo: any, overrides: { sigScript?: string; computeBudget?: number; version?: number; fee?: bigint }) {
    const fee = overrides.fee ?? HISTORICAL_TRIAL_ZK_FEE_SOMPI;
    const utxoAmount = BigInt(targetUtxo.utxoEntry.amount);
    return new kaspa.Transaction({
      version: overrides.version ?? 1,
      inputs: [
        {
          previousOutpoint: targetUtxo.outpoint,
          signatureScript: overrides.sigScript ?? zkScripts.sigScript,
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: overrides.computeBudget ?? DEFAULT_ZK_COMPUTE_BUDGET,
          utxo: {
            outpoint: targetUtxo.outpoint,
            amount: utxoAmount,
            scriptPublicKey: new kaspa.ScriptPublicKey(zkScripts.p2shScriptPublicKey.version, zkScripts.p2shScriptPublicKey.script),
            blockDaaScore: BigInt(targetUtxo.utxoEntry.blockDaaScore),
            isCoinbase: false
          }
        }
      ],
      outputs: [{ value: utxoAmount - fee, scriptPublicKey: new kaspa.ScriptPublicKey(minerSpk.version, minerSpk.script) }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "",
      storageMass: 0n
    });
  }

  async function expectRejected(testCase: string, tx: any, expectedPattern: RegExp): Promise<void> {
    let rawError: string | undefined;
    try {
      await client.submitTransaction(tx);
    } catch (err: any) {
      rawError = String(err?.message ?? err);
    }
    const rejected = rawError !== undefined;
    const matched = rejected && expectedPattern.test(rawError!);
    evidence.negativeCases.push({ testCase, rejected, rawError, expectedPattern: expectedPattern.source, matchedExpectedPattern: matched });
    expect(rejected, `${testCase}: node accepted a transaction it must reject`).toBe(true);
    expect(matched, `${testCase}: unexpected rejection message: ${rawError}`).toBe(true);
  }

  beforeAll(async () => {
    node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    if (node.simulated === true) throw new Error("the harness fell back to a simulated node; real kaspad required");
    client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });
    kaspa = loadManagedKaspaWasmSync();
    minerPrivateKey = new kaspa.PrivateKey("22".repeat(32));
    minerAddress = minerPrivateKey.toAddress("simnet").toString();
    minerSpk = kaspa.payToAddressScript(new kaspa.Address(minerAddress));
    const receiptHex = fs
      .readFileSync(path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official", "receipt.hex"), "utf8")
      .trim();
    zkScripts = buildR0Groth16Scripts({ imageId: officialImageId, journalHash: officialJournalHash, receiptHex });
    p2shAddress = zkScripts.p2shAddresses.simnet;
    evidence.node.rpcUrl = node.rpcUrl;
    evidence.p2shAddress = p2shAddress;
    evidence.redeemScriptHash = zkScripts.redeemScriptHash;
    evidence.spend.payoutAddress = minerAddress;
  }, 300000);

  afterAll(async () => {
    try {
      writeEvidence();
    } finally {
      try {
        await client?.close();
      } finally {
        await node?.kill();
      }
    }
  });

  it("talks to the node the harness raised and records its version (no exact pin)", async () => {
    const info = (await client.getInfo()) as any;
    serverVersion = String(info.serverVersion);
    evidence.node.serverVersion = serverVersion;
    expect(serverVersion).toMatch(/^\d+\.\d+\.\d+/);
    if (!/^2\.[1-9]|^[3-9]\./.test(serverVersion)) {
      evidence.notes!.push(`node version ${serverVersion} predates Toccata (2.1.0); precompile results are not meaningful`);
    }
    expect(info.networkId).toBe("simnet");
    expect(info.isUtxoIndexed).toBe(true);
  });

  it("rejects a v1 ZK spend of an unknown outpoint as an orphan (wire parsing reached; rejected before script execution)", async () => {
    const fake = { outpoint: { transactionId: "22".repeat(32), index: 0 }, utxoEntry: { amount: "200000000", blockDaaScore: "0" } };
    await expectRejected("orphan_outpoint", spendTx(fake, { fee: 10000n }), /orphan/i);
  });

  it("funds the P2SH address and observes the UTXO", async () => {
    const fundingUtxo = await getMatureMinerUtxo();
    const p2shSpk = kaspa.payToAddressScript(new kaspa.Address(p2shAddress));
    const fundingAmount = 200000000n;
    const standardFee = 500000n;
    const fundingTx = new kaspa.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: fundingUtxo.outpoint,
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1,
          utxo: {
            outpoint: fundingUtxo.outpoint,
            amount: BigInt(fundingUtxo.utxoEntry.amount),
            scriptPublicKey: new kaspa.ScriptPublicKey(0, fundingUtxo.utxoEntry.scriptPublicKey.slice(4)),
            blockDaaScore: BigInt(fundingUtxo.utxoEntry.blockDaaScore),
            isCoinbase: fundingUtxo.utxoEntry.isCoinbase
          }
        }
      ],
      outputs: [
        { value: fundingAmount, scriptPublicKey: new kaspa.ScriptPublicKey(p2shSpk.version, p2shSpk.script) },
        { value: BigInt(fundingUtxo.utxoEntry.amount) - fundingAmount - standardFee, scriptPublicKey: new kaspa.ScriptPublicKey(minerSpk.version, minerSpk.script) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "",
      storageMass: 0n
    });
    const signed = kaspa.signTransaction(fundingTx, [minerPrivateKey], true);
    const submit = (await client.submitTransaction(signed)) as any;
    evidence.funding.txId = String(submit.transactionId);
    evidence.funding.accepted = true;
    await node.mining.mineBlocks(5, { payAddress: minerAddress });
    const match = (await utxosOf(p2shAddress)).find((e: any) => e.outpoint.transactionId === evidence.funding.txId && e.outpoint.index === 0);
    evidence.funding.utxoObserved = match !== undefined;
    expect(match).toBeDefined();
    expect(BigInt(match.utxoEntry.amount)).toBe(fundingAmount);
  }, 300000);

  it("rejects an insufficient compute budget (script units exceeded)", async () => {
    const target = (await utxosOf(p2shAddress))[0];
    await expectRejected("insufficient_compute_budget", spendTx(target, { computeBudget: 10 }), /script units exceeded/i);
  });

  it("rejects tampered proof bytes (ZK integrity)", async () => {
    const target = (await utxosOf(p2shAddress))[0];
    const tamperedProof = "01".repeat(32) + zkScripts.preparedProof.slice(64);
    await expectRejected("tampered_groth16_proof", spendTx(target, { sigScript: zkScripts.sigScript.replace(zkScripts.preparedProof, tamperedProof) }), /ZK Integrity|Groth16 verification failed/i);
  });

  it("rejects an altered journal hash (ZK integrity)", async () => {
    const target = (await utxosOf(p2shAddress))[0];
    await expectRejected("altered_journal_hash", spendTx(target, { sigScript: zkScripts.sigScript.replace(officialJournalHash, "88".repeat(32)) }), /ZK Integrity|Groth16 verification failed/i);
  });

  it("rejects a truncated proof push", async () => {
    const target = (await utxosOf(p2shAddress))[0];
    await expectRejected("truncated_proof_push_script", spendTx(target, { sigScript: zkScripts.sigScript.slice(0, 150) }), /opcode requires \d+ bytes, but script only has \d+ remaining/i);
  });

  it("rejects a version-0 transaction invoking the precompile", async () => {
    const target = (await utxosOf(p2shAddress))[0];
    await expectRejected("tx_version_0_precompile_forbidden", spendTx(target, { version: 0, computeBudget: 0 }), /script units exceeded/i);
  });

  it("rejects a fee below the compute-mass requirement (mempool standardness)", async () => {
    const target = (await utxosOf(p2shAddress))[0];
    await expectRejected("insufficient_fee_for_compute_mass", spendTx(target, { fee: 500000n }), /not standard|fees which is under the required amount/i);
  });

  it("accepts the valid RISC Zero Groth16 spend and pays out", async () => {
    const target = (await utxosOf(p2shAddress)).find((e: any) => e.outpoint.transactionId === evidence.funding.txId);
    expect(target).toBeDefined();
    const tx = spendTx(target, {});
    let submit: any;
    try {
      submit = await client.submitTransaction(tx);
    } catch (err: any) {
      evidence.spend.rawError = String(err?.message ?? err);
      throw err;
    }
    evidence.spend.txId = String(submit.transactionId);
    evidence.spend.accepted = true;
    await node.mining.mineBlocks(5, { payAddress: minerAddress });
    const stillPresent = (await utxosOf(p2shAddress)).some((e: any) => e.outpoint.transactionId === evidence.funding.txId && e.outpoint.index === 0);
    expect(stillPresent).toBe(false);
    const payout = (await utxosOf(minerAddress)).find((e: any) => e.outpoint.transactionId === evidence.spend.txId);
    evidence.spend.payoutUtxoObserved = payout !== undefined;
    if (payout) evidence.spend.blockDaaScore = String(payout.utxoEntry.blockDaaScore);
    expect(payout).toBeDefined();
    expect(BigInt(payout.utxoEntry.amount)).toBe(BigInt(target.utxoEntry.amount) - HISTORICAL_TRIAL_ZK_FEE_SOMPI);
  }, 300000);
});
