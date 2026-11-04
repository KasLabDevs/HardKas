import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  createCovenantTransitionFactArtifact,
  createZkVerificationFactArtifact,
  createTxObservationArtifact,
  HardkasSchemas
} from "@hardkas/artifacts";

const cliDist = path.resolve(__dirname, "../dist/index.js");

function seal(draft: any, label?: "planId" | "signedId"): any {
  const a: any = { ...draft, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  if (label === "planId") a.planId = `plan-${a.contentHash.slice(0, 16)}`;
  if (label === "signedId") a.signedId = `signed-${a.contentHash.slice(0, 16)}`;
  return a;
}

function makeObservation(
  txId: string,
  sinkBlue: number,
  acceptBlue: number,
  networkId = "simnet",
  observerId = "obs_" + "11".repeat(32),
  acceptingBlockHash = "ab".repeat(32)
) {
  const diff = sinkBlue - acceptBlue;
  return createTxObservationArtifact(
    {
      networkId: networkId as any,
      mode: "simulator",
      subject: { txId },
      observer: {
        observerId,
        kind: "rpc",
        networkId: networkId as any,
        serverVersion: "2.0.1",
        capabilities: { reorgAware: true },
        description: "observation through configured RPC observer"
      },
      point: {
        virtualDaaScore: sinkBlue.toString(),
        sinkHash: "f".repeat(64),
        sinkBlueScore: sinkBlue.toString()
      },
      finding: {
        type: "chain_accepted",
        acceptingBlockHash,
        acceptingBlueScore: acceptBlue.toString(),
        confirmationsBlue: diff.toString()
      },
      evidence: [{ method: "getVirtualChainFromBlock", params: {}, responseDigest: "0".repeat(64) }]
    },
    { clock: { now: () => 1700000000000 } } as any
  );
}

let workspaceRoot: string;
let artifactsDir: string;

const TX_L1 = "11".repeat(32);
const TX_COVENANT = "22".repeat(32);
const TX_ZK = "33".repeat(32);
const TX_EXTERNAL = "44".repeat(32);
const TX_CONTRADICTORY = "55".repeat(32);
const TX_PAYOUT_MISMATCH = "66".repeat(32);
const TX_SUCCESSOR_MISMATCH = "77".repeat(32);
const TX_UNBOUND_DRAFT = "88".repeat(32);
const TX_SHALLOW = "99".repeat(32);
const TX_CONFLICTING = "fa".repeat(32);

let l1PlanId: string;
let l1SignedId: string;
let l1SubId: string;

let covPlanId: string;
let covSignedId: string;
let covSubId: string;
let covFactId: string;

let zkPlanId: string;
let zkSignedId: string;
let zkSubId: string;
let zkFactId: string;

beforeAll(async () => {
  workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-why-forensics-"));
  artifactsDir = path.join(workspaceRoot, ".hardkas", "artifacts");
  await fsp.mkdir(path.join(artifactsDir, "signed"), { recursive: true });
  await fsp.mkdir(path.join(artifactsDir, "receipts"), { recursive: true });
  await fsp.mkdir(path.join(artifactsDir, "observations"), { recursive: true });
  await fsp.mkdir(path.join(artifactsDir, "evidences"), { recursive: true });

  // ---------------------------------------------------------------------------
  // 1. Standard L1 Transaction Setup
  // ---------------------------------------------------------------------------
  const l1Plan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "100000000" }]
    },
    "planId"
  );
  l1PlanId = l1Plan.contentHash;

  const l1Signed = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_L1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: l1PlanId, lineageId: l1PlanId, rootArtifactId: l1PlanId, sequence: 2 },
      signatures: { funder: "schnorr_sig_hex" }
    },
    "signedId"
  );
  l1SignedId = l1Signed.contentHash;

  const l1Sub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_L1,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: l1SignedId, lineageId: l1PlanId, rootArtifactId: l1PlanId, sequence: 3 },
    submitResult: { accepted: true }
  });
  l1SubId = l1Sub.contentHash;

  await fsp.writeFile(path.join(artifactsDir, `plan-${l1PlanId.slice(0, 16)}.json`), JSON.stringify(l1Plan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-${l1SignedId.slice(0, 16)}.json`), JSON.stringify(l1Signed));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-${l1SubId.slice(0, 16)}.json`), JSON.stringify(l1Sub));

  // ---------------------------------------------------------------------------
  // 2. Covenant Transaction Setup (with CovenantTransitionFactV1)
  // ---------------------------------------------------------------------------
  const covPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "500000000" }]
    },
    "planId"
  );
  covPlanId = covPlan.contentHash;

  const covSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_COVENANT,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: covPlanId, lineageId: covPlanId, rootArtifactId: covPlanId, sequence: 2 }
    },
    "signedId"
  );
  covSignedId = covSigned.contentHash;

  const covSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_COVENANT,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: covSignedId, lineageId: covPlanId, rootArtifactId: covPlanId, sequence: 3 },
    submitResult: { accepted: true }
  });
  covSubId = covSub.contentHash;

  const covFact = createCovenantTransitionFactArtifact({
    networkId: "simnet",
    covenantId: "cc".repeat(32),
    contractName: "zk_vault.silver",
    artifactSha256: "ee".repeat(32),
    entrypoint: "withdraw",
    previousState: { balance: 1000 },
    nextState: { balance: 500 },
    spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
    successorOutpoint: { transactionId: TX_COVENANT, index: 0 },
    successorAmountSompi: "500000000",
    planArtifactId: covPlanId,
    draftArtifactId: covSignedId,
    txId: TX_COVENANT,
    validation: {
      structuralPassed: true,
      scriptVmPassed: true,
      vmStatus: "SUCCESS"
    }
  });
  covFactId = covFact.contentHash!;

  await fsp.writeFile(path.join(artifactsDir, `plan-${covPlanId.slice(0, 16)}.json`), JSON.stringify(covPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-${covSignedId.slice(0, 16)}.json`), JSON.stringify(covSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-${covSubId.slice(0, 16)}.json`), JSON.stringify(covSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `cov-fact-${covFactId.slice(0, 16)}.json`), JSON.stringify(covFact));

  // Observation for TX_COVENANT: sinkBlue 1150, acceptBlue 1000 -> 150 confirmations
  const covObservation = makeObservation(TX_COVENANT, 1150, 1000);
  await fsp.writeFile(path.join(artifactsDir, "observations", `obs-cov-${covObservation.contentHash.slice(0, 16)}.json`), JSON.stringify(covObservation));

  // ---------------------------------------------------------------------------
  // 3. ZK Transaction Setup (with ZkVerificationFactV1)
  // ---------------------------------------------------------------------------
  const zkPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "200000000" }]
    },
    "planId"
  );
  zkPlanId = zkPlan.contentHash;

  const zkSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_ZK,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: zkPlanId, lineageId: zkPlanId, rootArtifactId: zkPlanId, sequence: 2 }
    },
    "signedId"
  );
  zkSignedId = zkSigned.contentHash;

  const zkSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_ZK,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: zkSignedId, lineageId: zkPlanId, rootArtifactId: zkPlanId, sequence: 3 },
    submitResult: { accepted: true }
  });
  zkSubId = zkSub.contentHash;

  const zkFact = createZkVerificationFactArtifact({
    networkId: "simnet",
    provingSystem: "Groth16",
    curve: "BN254",
    guestSystem: "RISC Zero",
    imageId: "bb".repeat(32),
    journalHash: "dd".repeat(32),
    proofSha256: "ff".repeat(32),
    verifiedOffChain: true,
    spendUtxo: { transactionId: "99".repeat(32), index: 0, amountSompi: "205000000" },
    p2shAddress: "kaspatest:przk...",
    redeemScriptHash: "88".repeat(32),
    planArtifactId: zkPlanId,
    draftArtifactId: zkSignedId,
    txId: TX_ZK,
    payoutAddress: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    payoutSompi: "200000000",
    computeBudget: 15000,
    feeSompi: "5000000"
  });
  zkFactId = zkFact.contentHash!;

  await fsp.writeFile(path.join(artifactsDir, `plan-${zkPlanId.slice(0, 16)}.json`), JSON.stringify(zkPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-${zkSignedId.slice(0, 16)}.json`), JSON.stringify(zkSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-${zkSubId.slice(0, 16)}.json`), JSON.stringify(zkSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `zk-fact-${zkFactId.slice(0, 16)}.json`), JSON.stringify(zkFact));

  // Observation for ZK TX: sinkBlue 2200, acceptBlue 2000 -> 200 confirmations
  const zkObservation = makeObservation(TX_ZK, 2200, 2000);
  await fsp.writeFile(path.join(artifactsDir, "observations", `obs-zk-${zkObservation.contentHash.slice(0, 16)}.json`), JSON.stringify(zkObservation));

  // ---------------------------------------------------------------------------
  // 4. External Transaction Setup (Observed Only)
  // ---------------------------------------------------------------------------
  const extObservation = makeObservation(TX_EXTERNAL, 3150, 3000);
  await fsp.writeFile(path.join(artifactsDir, "observations", `obs-ext-${extObservation.contentHash.slice(0, 16)}.json`), JSON.stringify(extObservation));

  // ---------------------------------------------------------------------------
  // 5. Contradictory / Mismatched Fact Setup
  // ---------------------------------------------------------------------------
  const badPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "100000000" }]
    },
    "planId"
  );
  const badSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_CONTRADICTORY,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: badPlan.contentHash, lineageId: badPlan.contentHash, rootArtifactId: badPlan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const badSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_CONTRADICTORY,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: badSigned.contentHash, lineageId: badPlan.contentHash, rootArtifactId: badPlan.contentHash, sequence: 3 },
    submitResult: { accepted: true }
  });
  // Fact claims a different plan than the actual causal parent
  const mismatchedFact = createCovenantTransitionFactArtifact({
    networkId: "simnet",
    covenantId: "cc".repeat(32),
    contractName: "counter.silver",
    artifactSha256: "ee".repeat(32),
    entrypoint: "increment",
    spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
    successorOutpoint: { transactionId: TX_CONTRADICTORY, index: 0 },
    planArtifactId: "99".repeat(32), // Intentionally mismatched!
    draftArtifactId: badSigned.contentHash,
    txId: TX_CONTRADICTORY,
    validation: {
      structuralPassed: true,
      scriptVmPassed: true
    }
  });
  await fsp.writeFile(path.join(artifactsDir, `plan-bad-${badPlan.contentHash.slice(0, 16)}.json`), JSON.stringify(badPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-bad-${badSigned.contentHash.slice(0, 16)}.json`), JSON.stringify(badSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-bad-${badSub.contentHash.slice(0, 16)}.json`), JSON.stringify(badSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `fact-mismatched-${mismatchedFact.contentHash!.slice(0, 16)}.json`), JSON.stringify(mismatchedFact));

  // ---------------------------------------------------------------------------
  // 6. ZK Payout Mismatch Setup
  // ---------------------------------------------------------------------------
  const badPayoutPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:attacker", amountSompi: "100000000" }]
    },
    "planId"
  );
  const badPayoutSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_PAYOUT_MISMATCH,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: badPayoutPlan.contentHash, lineageId: badPayoutPlan.contentHash, rootArtifactId: badPayoutPlan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const badPayoutSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_PAYOUT_MISMATCH,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: badPayoutSigned.contentHash, lineageId: badPayoutPlan.contentHash, rootArtifactId: badPayoutPlan.contentHash, sequence: 3 },
    submitResult: { accepted: true }
  });
  const badPayoutFact = createZkVerificationFactArtifact({
    networkId: "simnet",
    provingSystem: "Groth16",
    curve: "BN254",
    guestSystem: "RISC Zero",
    imageId: "bb".repeat(32),
    journalHash: "dd".repeat(32),
    proofSha256: "ff".repeat(32),
    verifiedOffChain: true,
    spendUtxo: { transactionId: "99".repeat(32), index: 0, amountSompi: "205000000" },
    p2shAddress: "kaspatest:przk...",
    redeemScriptHash: "88".repeat(32),
    planArtifactId: badPayoutPlan.contentHash,
    draftArtifactId: badPayoutSigned.contentHash,
    txId: TX_PAYOUT_MISMATCH,
    payoutAddress: "kaspatest:victim", // Plan does NOT pay victim!
    payoutSompi: "500000000",
    computeBudget: 15000,
    feeSompi: "5000000"
  });
  await fsp.writeFile(path.join(artifactsDir, `plan-payout-${badPayoutPlan.contentHash.slice(0, 16)}.json`), JSON.stringify(badPayoutPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-payout-${badPayoutSigned.contentHash.slice(0, 16)}.json`), JSON.stringify(badPayoutSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-payout-${badPayoutSub.contentHash.slice(0, 16)}.json`), JSON.stringify(badPayoutSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `zk-payout-bad-${badPayoutFact.contentHash!.slice(0, 16)}.json`), JSON.stringify(badPayoutFact));

  // ---------------------------------------------------------------------------
  // 7. Covenant Successor Mismatch Setup
  // ---------------------------------------------------------------------------
  const badSuccPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "100000000" }]
    },
    "planId"
  );
  const badSuccSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_SUCCESSOR_MISMATCH,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: badSuccPlan.contentHash, lineageId: badSuccPlan.contentHash, rootArtifactId: badSuccPlan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const badSuccSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_SUCCESSOR_MISMATCH,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: badSuccSigned.contentHash, lineageId: badSuccPlan.contentHash, rootArtifactId: badSuccPlan.contentHash, sequence: 3 },
    submitResult: { accepted: true }
  });
  const badSuccFact = createCovenantTransitionFactArtifact({
    networkId: "simnet",
    covenantId: "cc".repeat(32),
    contractName: "counter.silver",
    artifactSha256: "ee".repeat(32),
    entrypoint: "increment",
    spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
    successorOutpoint: { transactionId: "12".repeat(32), index: 0 }, // Successor txId is 1212... instead of TX_SUCCESSOR_MISMATCH!
    planArtifactId: badSuccPlan.contentHash,
    draftArtifactId: badSuccSigned.contentHash,
    txId: TX_SUCCESSOR_MISMATCH,
    validation: {
      structuralPassed: true,
      scriptVmPassed: true
    }
  });
  await fsp.writeFile(path.join(artifactsDir, `plan-succ-${badSuccPlan.contentHash.slice(0, 16)}.json`), JSON.stringify(badSuccPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-succ-${badSuccSigned.contentHash.slice(0, 16)}.json`), JSON.stringify(badSuccSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-succ-${badSuccSub.contentHash.slice(0, 16)}.json`), JSON.stringify(badSuccSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `cov-succ-bad-${badSuccFact.contentHash!.slice(0, 16)}.json`), JSON.stringify(badSuccFact));

  // ---------------------------------------------------------------------------
  // 8. Unbound Draft Setup
  // ---------------------------------------------------------------------------
  const unboundPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "100000000" }]
    },
    "planId"
  );
  const unboundSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_UNBOUND_DRAFT,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: unboundPlan.contentHash, lineageId: unboundPlan.contentHash, rootArtifactId: unboundPlan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const unboundSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_UNBOUND_DRAFT,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: unboundSigned.contentHash, lineageId: unboundPlan.contentHash, rootArtifactId: unboundPlan.contentHash, sequence: 3 },
    submitResult: { accepted: true }
  });
  const unboundFact = createCovenantTransitionFactArtifact({
    networkId: "simnet",
    covenantId: "cc".repeat(32),
    contractName: "counter.silver",
    artifactSha256: "ee".repeat(32),
    entrypoint: "increment",
    spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
    successorOutpoint: { transactionId: TX_UNBOUND_DRAFT, index: 0 },
    planArtifactId: unboundPlan.contentHash,
    // draftArtifactId omitted!
    txId: TX_UNBOUND_DRAFT,
    validation: {
      structuralPassed: true,
      scriptVmPassed: true
    }
  });
  await fsp.writeFile(path.join(artifactsDir, `plan-unbound-${unboundPlan.contentHash.slice(0, 16)}.json`), JSON.stringify(unboundPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-unbound-${unboundSigned.contentHash.slice(0, 16)}.json`), JSON.stringify(unboundSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-unbound-${unboundSub.contentHash.slice(0, 16)}.json`), JSON.stringify(unboundSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `cov-unbound-${unboundFact.contentHash!.slice(0, 16)}.json`), JSON.stringify(unboundFact));

  // ---------------------------------------------------------------------------
  // 9. Shallow Observation Setup (low confirmations -> ACCEPTED not CONFIRMED)
  // ---------------------------------------------------------------------------
  const shallowPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "100000000" }]
    },
    "planId"
  );
  const shallowSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_SHALLOW,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: shallowPlan.contentHash, lineageId: shallowPlan.contentHash, rootArtifactId: shallowPlan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const shallowSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_SHALLOW,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: shallowSigned.contentHash, lineageId: shallowPlan.contentHash, rootArtifactId: shallowPlan.contentHash, sequence: 3 },
    submitResult: { accepted: true }
  });
  const shallowFact = createCovenantTransitionFactArtifact({
    networkId: "simnet",
    covenantId: "cc".repeat(32),
    contractName: "counter.silver",
    artifactSha256: "ee".repeat(32),
    entrypoint: "increment",
    previousState: { count: 1 },
    nextState: { count: 2 },
    spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
    successorOutpoint: { transactionId: TX_SHALLOW, index: 0 },
    planArtifactId: shallowPlan.contentHash,
    draftArtifactId: shallowSigned.contentHash,
    txId: TX_SHALLOW,
    validation: {
      structuralPassed: true,
      scriptVmPassed: true
    }
  });
  const shallowObs = makeObservation(TX_SHALLOW, 1002, 1000); // 2 confirmations < policy 100
  await fsp.writeFile(path.join(artifactsDir, `plan-shallow-${shallowPlan.contentHash.slice(0, 16)}.json`), JSON.stringify(shallowPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-shallow-${shallowSigned.contentHash.slice(0, 16)}.json`), JSON.stringify(shallowSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-shallow-${shallowSub.contentHash.slice(0, 16)}.json`), JSON.stringify(shallowSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `cov-shallow-${shallowFact.contentHash!.slice(0, 16)}.json`), JSON.stringify(shallowFact));
  await fsp.writeFile(path.join(artifactsDir, "observations", `obs-shallow-${shallowObs.contentHash.slice(0, 16)}.json`), JSON.stringify(shallowObs));

  // ---------------------------------------------------------------------------
  // 10. Conflicting Observers Setup
  // ---------------------------------------------------------------------------
  const confPlan = seal(
    {
      schema: HardkasSchemas.TxPlanV1,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", sequence: 1 },
      outputs: [{ address: "kaspatest:qpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amountSompi: "100000000" }]
    },
    "planId"
  );
  const confSigned = seal(
    {
      schema: HardkasSchemas.SignedTxV1,
      txId: TX_CONFLICTING,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: confPlan.contentHash, lineageId: confPlan.contentHash, rootArtifactId: confPlan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const confSub = seal({
    schema: HardkasSchemas.TxSubmissionV1,
    txId: TX_CONFLICTING,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: confSigned.contentHash, lineageId: confPlan.contentHash, rootArtifactId: confPlan.contentHash, sequence: 3 },
    submitResult: { accepted: true }
  });
  const confCovFact = createCovenantTransitionFactArtifact({
    networkId: "simnet",
    covenantId: "cc".repeat(32),
    contractName: "counter.silver",
    artifactSha256: "ee".repeat(32),
    entrypoint: "increment",
    previousState: { count: 1 },
    nextState: { count: 2 },
    spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
    successorOutpoint: { transactionId: TX_CONFLICTING, index: 0 },
    planArtifactId: confPlan.contentHash,
    draftArtifactId: confSigned.contentHash,
    txId: TX_CONFLICTING,
    validation: {
      structuralPassed: true,
      scriptVmPassed: true
    }
  });
  // Observer 1 reports block "11"
  const confObs1 = makeObservation(TX_CONFLICTING, 1100, 1000, "simnet", "obs_" + "01".repeat(32), "11".repeat(32));
  // Observer 2 reports block "22" (disagreement!)
  const confObs2 = makeObservation(TX_CONFLICTING, 1100, 1000, "simnet", "obs_" + "02".repeat(32), "22".repeat(32));
  await fsp.writeFile(path.join(artifactsDir, `plan-conf-${confPlan.contentHash.slice(0, 16)}.json`), JSON.stringify(confPlan));
  await fsp.writeFile(path.join(artifactsDir, "signed", `signed-conf-${confSigned.contentHash.slice(0, 16)}.json`), JSON.stringify(confSigned));
  await fsp.writeFile(path.join(artifactsDir, "receipts", `sub-conf-${confSub.contentHash.slice(0, 16)}.json`), JSON.stringify(confSub));
  await fsp.writeFile(path.join(artifactsDir, "evidences", `cov-conf-${confCovFact.contentHash!.slice(0, 16)}.json`), JSON.stringify(confCovFact));
  await fsp.writeFile(path.join(artifactsDir, "observations", `obs-conf1-${confObs1.contentHash.slice(0, 16)}.json`), JSON.stringify(confObs1));
  await fsp.writeFile(path.join(artifactsDir, "observations", `obs-conf2-${confObs2.contentHash.slice(0, 16)}.json`), JSON.stringify(confObs2));
});

afterAll(async () => {
  if (workspaceRoot) {
    await fsp.rm(workspaceRoot, { recursive: true, force: true });
  }
});

function runHardkas(args: string) {
  try {
    const stdout = execSync(`node "${cliDist}" ${args}`, {
      encoding: "utf8",
      stdio: "pipe",
      cwd: workspaceRoot,
      env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1" }
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e: any) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? ""
    };
  }
}

describe("Unified Retrospective Forensics via `hardkas why`", () => {
  // ---------------------------------------------------------------------------
  // Condition 1: Conventional L1 transaction preserves full backwards compatibility
  // ---------------------------------------------------------------------------
  it("Condition 1: Conventional L1 transaction preserves exact JSON keys and causal chain", () => {
    const r = runHardkas(`why --tx ${TX_L1} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    // Assert exact top-level keys required by stage-b-2.test.ts line 538
    expect(Object.keys(out).sort()).toEqual(["authScope", "chain", "origin", "resolvedBy", "resolvedPath", "target"]);
    expect(out.origin).toBe("submitted");
    expect(out.target).toBe(l1SubId);

    // Chain length must be 3 (Submission, Signed, Plan)
    expect(out.chain.length).toBe(3);
    expect(out.chain[0].id).toBe(l1SubId);
    expect(out.chain[1].id).toBe(l1SignedId);
    expect(out.chain[2].id).toBe(l1PlanId);

    // No false associated facts attached
    expect(out.chain[0].associatedFacts).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Condition 2: Covenant transaction shows contract, method and transition
  // ---------------------------------------------------------------------------
  it("Condition 2: Covenant transaction displays verified contract transition evidence", () => {
    const r = runHardkas(`why --tx ${TX_COVENANT} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    expect(Object.keys(out).sort()).toEqual(["authScope", "chain", "origin", "resolvedBy", "resolvedPath", "target"]);
    expect(out.chain.length).toBe(3); // Causal chain remains unchanged: Sub -> Signed -> Plan

    const targetNode = out.chain[0];
    expect(targetNode.associatedFacts).toBeDefined();
    expect(targetNode.associatedFacts.length).toBe(1);

    const fact = targetNode.associatedFacts[0];
    expect(fact.schema).toBe(HardkasSchemas.CovenantTransitionFactV1);
    expect(fact.id).toBe(covFactId);
    expect(fact.relation).toBe("exact");
    expect(fact.details).toContain("zk_vault.silver.withdraw");
    expect(fact.details).toContain("ScriptVM PASSED");
    expect(fact.details).toContain("Contract state transition declared; node execution requires consensus observation");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_COVENANT}`);
    expect(human.code, `code=${human.code}, stderr=${human.stderr}, stdout=${human.stdout}`).toBe(0);
    expect(human.stdout).toContain("Associated Evidence:");
    expect(human.stdout).toMatch(/Covenant Transition.*EXACT/i);
    expect(human.stdout).toContain("zk_vault.silver.withdraw");
  });

  // ---------------------------------------------------------------------------
  // Condition 3: ZK operation shows local math verification without confusing with consensus
  // ---------------------------------------------------------------------------
  it("Condition 3: ZK operation displays off-chain math verification with explicit consensus boundary", () => {
    const r = runHardkas(`why --tx ${TX_ZK} --json`);
    expect(r.code, `code=${r.code}, stderr=${r.stderr}, stdout=${r.stdout}`).toBe(0);
    const out = JSON.parse(r.stdout);

    expect(Object.keys(out).sort()).toEqual(["authScope", "chain", "origin", "resolvedBy", "resolvedPath", "target"]);
    const targetNode = out.chain[0];
    expect(targetNode.associatedFacts).toBeDefined();
    expect(targetNode.associatedFacts.length).toBe(1);

    const fact = targetNode.associatedFacts[0];
    expect(fact.schema).toBe(HardkasSchemas.ZkVerificationFactV1);
    expect(fact.id).toBe(zkFactId);
    expect(fact.relation).toBe("exact");
    expect(fact.details).toContain("RISC Zero Groth16 BN254");
    expect(fact.details).toContain("Math verified locally");
    expect(fact.details).toContain("Cryptographic Groth16 proof verified off-chain; consensus acceptance requires OpZkPrecompile execution in DAG");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_ZK}`);
    expect(human.code, `code=${human.code}, stderr=${human.stderr}, stdout=${human.stdout}`).toBe(0);
    expect(human.stdout).toMatch(/ZK Verification.*EXACT/i);
    expect(human.stdout).toContain("Math verified locally");
    expect(human.stdout).toContain("requires OpZkPrecompile");
  });

  // ---------------------------------------------------------------------------
  // Condition 4: External transaction receives no invented private facts
  // ---------------------------------------------------------------------------
  it("Condition 4: External transaction is resolved strictly as observed without inventing private facts", () => {
    const r = runHardkas(`why --tx ${TX_EXTERNAL} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    expect(out.origin).toBe("observed");
    expect(out.target).toBe(TX_EXTERNAL);
    expect(out.note).toContain("no submission recorded in this workspace");

    // Must not fabricate any submission, plan, or facts
    expect(out.submission).toBeNull();
    expect(out.chain).toBeUndefined();

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_EXTERNAL}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Observed Transaction");
    expect(human.stdout).toContain("no submission recorded in this workspace");
  });

  // ---------------------------------------------------------------------------
  // Condition 5: Mismatched / Contradictory facts are detected and flagged
  // ---------------------------------------------------------------------------
  it("Condition 5: Facts with mismatched plan references are flagged as contradictory", () => {
    const r = runHardkas(`why --tx ${TX_CONTRADICTORY} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.associatedFacts).toBeDefined();
    expect(targetNode.associatedFacts.length).toBe(1);

    const fact = targetNode.associatedFacts[0];
    expect(fact.relation).toBe("contradictory");
    expect(fact.reason).toContain("PLAN_MISMATCH");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_CONTRADICTORY}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("CONTRADICTORY");
    expect(human.stdout).toContain("PLAN_MISMATCH");
  });

  // ---------------------------------------------------------------------------
  // Condition 6: Offline status indicates stored observations basis
  // ---------------------------------------------------------------------------
  it("Condition 6: Offline status indicates derivation from stored observations without claiming live DAG state", () => {
    const r = runHardkas(`why --tx ${TX_COVENANT} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.offlineStatus).toBeDefined();
    const offline = targetNode.offlineStatus;
    expect(offline.observationsCount).toBe(1);
    expect(offline.covenant.kind).toBe("TRANSITION_CONFIRMED");
    expect(offline.offlineNotice).toContain("Derived offline from 1 stored observation(s); no live node was contacted");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_COVENANT}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Derived Status (Offline):");
    expect(human.stdout).toContain("Covenant:    TRANSITION_CONFIRMED");
    expect(human.stdout).toContain("no live node was contacted");
  });

  // ---------------------------------------------------------------------------
  // Condition 7: ZK payout mismatch is flagged as contradictory
  // ---------------------------------------------------------------------------
  it("Condition 7: ZK payout address / amount mismatch against plan outputs is flagged as contradictory", () => {
    const r = runHardkas(`why --tx ${TX_PAYOUT_MISMATCH} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.associatedFacts).toBeDefined();
    expect(targetNode.associatedFacts.length).toBe(1);

    const fact = targetNode.associatedFacts[0];
    expect(fact.relation).toBe("contradictory");
    expect(fact.reason).toContain("PAYOUT_MISMATCH");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_PAYOUT_MISMATCH}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("CONTRADICTORY");
    expect(human.stdout).toContain("PAYOUT_MISMATCH");
  });

  // ---------------------------------------------------------------------------
  // Condition 8: Covenant successor outpoint mismatch is flagged as contradictory
  // ---------------------------------------------------------------------------
  it("Condition 8: Covenant fact successor outpoint mismatching transaction id is flagged as contradictory", () => {
    const r = runHardkas(`why --tx ${TX_SUCCESSOR_MISMATCH} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.associatedFacts).toBeDefined();
    expect(targetNode.associatedFacts.length).toBe(1);

    const fact = targetNode.associatedFacts[0];
    expect(fact.relation).toBe("contradictory");
    expect(fact.reason).toContain("SUCCESSOR_MISMATCH");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_SUCCESSOR_MISMATCH}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("CONTRADICTORY");
    expect(human.stdout).toContain("SUCCESSOR_MISMATCH");
  });

  // ---------------------------------------------------------------------------
  // Condition 9: Unbound draft records compatible relation rather than exact
  // ---------------------------------------------------------------------------
  it("Condition 9: Covenant fact omitting draftArtifactId degrades relation to compatible with UNBOUND_DRAFT reason", () => {
    const r = runHardkas(`why --tx ${TX_UNBOUND_DRAFT} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.associatedFacts).toBeDefined();
    expect(targetNode.associatedFacts.length).toBe(1);

    const fact = targetNode.associatedFacts[0];
    expect(fact.relation).toBe("compatible");
    expect(fact.reason).toContain("UNBOUND_DRAFT");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_UNBOUND_DRAFT}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("COMPATIBLE");
    expect(human.stdout).toContain("UNBOUND_DRAFT");
  });

  // ---------------------------------------------------------------------------
  // Condition 10: Shallow observation derives ACCEPTED without claiming CONFIRMED or FINALIZED
  // ---------------------------------------------------------------------------
  it("Condition 10: Stale or low-confirmation observations never produce unjustifiably definitive conclusions", () => {
    const r = runHardkas(`why --tx ${TX_SHALLOW} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.offlineStatus).toBeDefined();
    const offline = targetNode.offlineStatus;

    // Tx status must be ACCEPTED, not CONFIRMED, and explicitly NOT final
    expect(offline.tx.status).toBe("ACCEPTED");
    expect(offline.tx.isFinal).toBe(false);
    expect(offline.covenant.isFinal).toBe(false);
    expect(offline.tx.reasons[0]).toContain("revertible until finality");

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_SHALLOW}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Derived Status (Offline):");
    expect(human.stdout).toContain("Transaction: ACCEPTED (2 blue-score confirmations)");
    expect(human.stdout).toContain("revertible until finality");
  });

  // ---------------------------------------------------------------------------
  // Condition 11: Conflicting observations between observers mark state as CONFLICTED
  // ---------------------------------------------------------------------------
  it("Condition 11: Contradictory observations across split observers result in CONFLICTING_OBSERVATIONS / CONFLICTED", () => {
    const r = runHardkas(`why --tx ${TX_CONFLICTING} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);

    const targetNode = out.chain[0];
    expect(targetNode.offlineStatus).toBeDefined();
    const offline = targetNode.offlineStatus;

    expect(offline.tx.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(offline.covenant.kind).toBe("CONFLICTED");
    expect(offline.tx.isFinal).toBe(false);
    expect(offline.covenant.isFinal).toBe(false);

    // Human output inspection
    const human = runHardkas(`why --tx ${TX_CONFLICTING}`);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Derived Status (Offline):");
    expect(human.stdout).toContain("CONFLICTING_OBSERVATIONS");
    expect(human.stdout).toContain("CONFLICTED");
  });
});
