import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildR0Groth16Plan,
  buildR0Groth16Scripts,
  prepareR0Groth16Proof,
  buildR0Groth16Transaction,
  observeZkSpendOnce,
  deriveZkOperationStatus,
  createZkVerificationFactArtifact,
  verifyR0Groth16ReceiptLocal,
  type ZkVerificationFact
} from "../src/index.js";
import type { KaspaRpcClient } from "@hardkas/kaspa-rpc";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

describe("Unified ZK Lifecycle (Persist Facts, Derive States)", () => {
  const officialFixtureDir = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
  const officialImageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
  const officialJournalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
  const officialReceiptHex = fs.readFileSync(path.join(officialFixtureDir, "receipt.hex"), "utf8").trim();

  it("completes full ZK lifecycle: parse -> build scripts -> verify receipt locally -> build plan -> build tx -> fact emitted -> observe -> TX_ACCEPTED", { timeout: 30000 }, async () => {
    // 1. Prepare proof & scripts
    const proof = prepareR0Groth16Proof(officialReceiptHex);
    expect(proof.length).toBe(256);

    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    expect(scripts.ok).toBe(true);

    // HardKAS's own verifier (pinned RISC Zero key) is the only source of verifiedOffChain (HK-17 / CA-ZK-03).
    const localVerification = await verifyR0Groth16ReceiptLocal({
      receiptHex: officialReceiptHex,
      imageId: officialImageId,
      journalHash: officialJournalHash
    });
    expect(localVerification.verified).toBe(true);

    const spendParams = {
      scripts,
      utxo: {
        transactionId: "11".repeat(32),
        index: 0,
        amountSompi: 100_000_000n
      },
      destinationAddress: scripts.p2shAddresses.simnet,
      computeBudget: 1600,
      feeSompi: 20_000_000n,
      networkId: "simnet" as const,
      localVerification
    };

    // 2. Build Plan Artifact
    const plan = buildR0Groth16Plan(spendParams);
    expect(plan.schema).toBe("hardkas.txPlan");
    expect(plan.txVersion).toBe(1);
    expect(plan.inputs[0]!.kind).toBe("p2sh");
    expect(plan.inputs[0]!.computeBudget).toBe(1600);
    expect(plan.outputs[0]!.address).toBe(spendParams.destinationAddress);
    expect(plan.outputs[0]!.amountSompi).toBe("80000000");

    // 3. Build Transaction (emits ZkVerificationFact + PlanArtifact)
    const txResult = buildR0Groth16Transaction(spendParams);
    expect(txResult.ok).toBe(true);
    expect(txResult.transactionId).toBeDefined();
    expect(txResult.planArtifact).toBeDefined();
    expect(txResult.zkFact).toBeDefined();

    const zkFact = txResult.zkFact!;
    expect(zkFact.schema).toBe("hardkas.zkVerificationFact.v1");
    expect(zkFact.provingSystem).toBe("Groth16");
    expect(zkFact.curve).toBe("BN254");
    expect(zkFact.guestSystem).toBe("RISC Zero");
    expect(zkFact.verifiedOffChain).toBe(true);
    expect(zkFact.payoutAddress).toBe(spendParams.destinationAddress);
    expect(zkFact.payoutSompi).toBe("80000000");
    expect(zkFact.txId).toBe(txResult.transactionId);

    // 4. Derive initial operation status before network submission
    const initialStatus = deriveZkOperationStatus({
      zkFact,
      txStatus: undefined
    });
    expect(initialStatus.kind).toBe("PROOF_VERIFIED_OFFCHAIN");
    expect(initialStatus.isFinal).toBe(false);

    // 5. Simulate network observation in mempool
    const mempoolStatus = deriveZkOperationStatus({
      zkFact,
      txStatus: {
        txId: txResult.transactionId,
        status: "MEMPOOL_ACCEPTED",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 10, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["Transaction accepted into node mempool"],
        isFinal: false
      }
    });
    expect(mempoolStatus.kind).toBe("TX_SUBMITTED");
    expect(mempoolStatus.isFinal).toBe(false);

    // 6. Simulate network confirmation via observeZkSpendOnce with a mock RPC
    const mockRpc: Partial<KaspaRpcClient> = {
      call: async (method: string, params: any) => {
        if (method === "getBlockDagInfo") {
          return {
            networkId: "simnet",
            virtualDaaScore: 1000n,
            sink: "22".repeat(32),
            pruningPointHash: "00".repeat(32),
            tipHashes: ["22".repeat(32)]
          };
        }
        if (method === "getSinkBlueScore") {
          return { blueScore: 1000n };
        }
        if (method === "getMempoolEntry") {
          return null;
        }
        if (method === "getVirtualChainFromBlock") {
          return {
            removedChainBlockHashes: [],
            addedChainBlockHashes: ["33".repeat(32)],
            acceptedTransactionIds: [
              {
                acceptingBlockHash: "33".repeat(32),
                acceptedTransactionIds: [txResult.transactionId]
              }
            ]
          };
        }
        if (method === "getBlock") {
          return {
            block: {
              header: {
                blueScore: 990n,
                daaScore: 990n
              }
            }
          };
        }
        return null;
      },
      getServerInfo: async () => ({ serverVersion: "2.1.0" }) as any
    };

    const observationResult = await observeZkSpendOnce(mockRpc as KaspaRpcClient, {
      txId: txResult.transactionId,
      zkFact
    });

    expect(observationResult.observation.schema).toBe("hardkas.txObservation.v1");
    expect(observationResult.derivedStatus.status).toBe("ACCEPTED");
    expect(observationResult.zkStatus).toBeDefined();
    // ACCEPTED = accepted by the virtual chain (the precompile verified the proof), not yet confirmed (ZK-10)
    expect(observationResult.zkStatus?.kind).toBe("TX_ACCEPTED");
    expect(observationResult.zkStatus?.txId).toBe(txResult.transactionId);
    expect(observationResult.zkStatus?.isFinal).toBe(false); // ACCEPTED is not FINALIZED yet
  });

  it("distinguishes 'not verified off-chain' (the default, not final) from an explicit local verification failure (HK-17)", () => {
    const params = {
      networkId: "simnet",
      imageId: "00".repeat(32),
      journalHash: "11".repeat(32),
      proofSha256: "22".repeat(32),
      spendUtxo: { transactionId: "33".repeat(32), index: 0, amountSompi: "100000000" },
      p2shAddress: "kaspasim:p2sh_test",
      redeemScriptHash: "44".repeat(32),
      payoutAddress: "kaspasim:payout",
      payoutSompi: "80000000",
      computeBudget: 1600,
      feeSompi: "20000000",
      txId: "55".repeat(32)
    };
    const notVerified = deriveZkOperationStatus({ zkFact: createZkVerificationFactArtifact({ ...params, verifiedOffChain: false }) });
    expect(notVerified.kind).toBe("PROOF_NOT_VERIFIED_OFFCHAIN");
    expect(notVerified.isFinal).toBe(false);

    const failedFact = createZkVerificationFactArtifact({
      ...params,
      verifiedOffChain: false,
      offChainVerification: "FAILED",
      offChainVerifier: "hardkas-r0-groth16-snarkjs-v1"
    });
    const status = deriveZkOperationStatus({ zkFact: failedFact });
    expect(status.kind).toBe("PROOF_VERIFICATION_FAILED");
    expect(status.isFinal).toBe(false); // only consensus finality is final
    expect(status.reason).toContain("rejected");
  });

  it("handles node consensus rejection: derives TX_REJECTED", () => {
    const zkFact = createZkVerificationFactArtifact({
      networkId: "simnet",
      imageId: "00".repeat(32),
      journalHash: "11".repeat(32),
      proofSha256: "22".repeat(32),
      verifiedOffChain: true,
      spendUtxo: { transactionId: "33".repeat(32), index: 0, amountSompi: "100000000" },
      p2shAddress: "kaspasim:p2sh_test",
      redeemScriptHash: "44".repeat(32),
      payoutAddress: "kaspasim:payout",
      payoutSompi: "80000000",
      computeBudget: 1600,
      feeSompi: "20000000",
      txId: "55".repeat(32)
    });

    const status = deriveZkOperationStatus({
      zkFact,
      txStatus: {
        txId: "55".repeat(32),
        status: "REJECTED_BY_NODE",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 10, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["Script precompile verification returned 0 (invalid proof)"],
        isFinal: true
      }
    });

    expect(status.kind).toBe("TX_REJECTED");
    expect(status.isFinal).toBe(true);
    expect(status.reason).toContain("rusty-kaspad consensus or precompile check");
  });

  it("handles DAG reorganization: derives TX_REORGED", () => {
    const zkFact = createZkVerificationFactArtifact({
      networkId: "simnet",
      imageId: "00".repeat(32),
      journalHash: "11".repeat(32),
      proofSha256: "22".repeat(32),
      verifiedOffChain: true,
      spendUtxo: { transactionId: "33".repeat(32), index: 0, amountSompi: "100000000" },
      p2shAddress: "kaspasim:p2sh_test",
      redeemScriptHash: "44".repeat(32),
      payoutAddress: "kaspasim:payout",
      payoutSompi: "80000000",
      computeBudget: 1600,
      feeSompi: "20000000",
      txId: "55".repeat(32)
    });

    const status = deriveZkOperationStatus({
      zkFact,
      txStatus: {
        txId: "55".repeat(32),
        status: "REORGED",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 10, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["Block removed during chain reorganization"],
        isFinal: false
      }
    });

    expect(status.kind).toBe("TX_REORGED");
    expect(status.isFinal).toBe(false);
  });

  it("supports offline audit reconstruction from persisted ZkVerificationFact alone", () => {
    const fact = createZkVerificationFactArtifact({
      networkId: "simnet",
      provingSystem: "Groth16",
      curve: "BN254",
      guestSystem: "RISC Zero",
      imageId: officialImageId,
      journalHash: officialJournalHash,
      proofSha256: "ee".repeat(32),
      verifiedOffChain: true,
      spendUtxo: { transactionId: "aa".repeat(32), index: 0, amountSompi: "50000000" },
      p2shAddress: "kaspasim:p2sh_mock",
      redeemScriptHash: "bb".repeat(32),
      payoutAddress: "kaspasim:destination_mock",
      payoutSompi: "30000000",
      computeBudget: 1600,
      feeSompi: "20000000",
      txId: "cc".repeat(32),
      planArtifactId: "dd".repeat(32)
    });

    // Offline verification without node:
    expect(fact.schema).toBe("hardkas.zkVerificationFact.v1");
    expect(fact.imageId).toBe(officialImageId);
    expect(fact.journalHash).toBe(officialJournalHash);
    expect(fact.spendUtxo.transactionId).toBe("aa".repeat(32));
    expect(fact.payoutAddress).toBe("kaspasim:destination_mock");
    expect(fact.payoutSompi).toBe("30000000");

    // Pure state derivation without node:
    const status = deriveZkOperationStatus({ zkFact: fact });
    expect(status.kind).toBe("PROOF_VERIFIED_OFFCHAIN");
    expect(status.isFinal).toBe(false);
    expect(status.txId).toBe("cc".repeat(32));
  });
});
