import { describe, it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runQualification,
  type RunnerInput
} from "../src/runner.js";
import {
  runStandardL1Scenario,
  type ProductTransactionPath,
  type PlanAndSignResult
} from "../src/scenarios/standard-l1.js";
import type { RemoteTestnetAuthority } from "../src/remote-node.js";
import type { SourceUtxoEvidence } from "../src/funding-input.js";
import type { SubmissionGuardRpc } from "../src/submission-guard.js";
import type { DaaObserverRpc, DaaObserverUtxoRow } from "../src/daa-observer.js";
import type { ChainAcceptanceObserver, ChainLookFinding } from "../src/chain-acceptance.js";
import type { QualificationToolchainIdentity } from "../src/receipt.js";

// --- helpers -----------------------------------------------------------------

async function tmpDir(prefix = "hk-tq-runner-"): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

const TXID = "aa".repeat(32);
const FUND_ADDR = "kaspatest:qrfund";
const DEST_ADDR = "kaspatest:qrdest";
const NETWORK = "testnet-10";
const STARTED_AT = new Date("2026-09-15T15:00:00.000Z");

function advancingClock(startIso: string, stepMs: number): () => Date {
  const start = new Date(startIso).getTime();
  let n = 0;
  return () => new Date(start + n++ * stepMs);
}

const noSleep = vi.fn(async (_ms: number) => {});

const AUTHORITY: RemoteTestnetAuthority = {
  authorityKind: "REMOTE_TESTNET_NODE",
  endpoint: { class: "wrpc", address: "ws://127.0.0.1:17110" },
  observedAt: STARTED_AT.toISOString(),
  network: { expected: NETWORK, observed: NETWORK },
  serverVersion: "0.16.0",
  rpcApiVersion: 1,
  isSynced: true,
  hasUtxoIndex: true,
  virtualDaaScore: 12345n,
  capabilities: { getNetworkParams: true, getFeeEstimate: true, hasUtxoIndex: true },
  probeHashes: { getServerInfo: "aa".repeat(32), getBlockDagInfo: "bb".repeat(32) }
};

const FUNDING: SourceUtxoEvidence = {
  outpoint: { transactionId: "bb".repeat(32), index: 0 },
  address: FUND_ADDR,
  amountSompi: 500_000_000_000n,
  scriptPublicKey: "20abcdef",
  isCoinbase: false,
  observedAt: STARTED_AT.toISOString(),
  maturityResolvedVia: "not-coinbase"
};

const TOOLCHAIN: QualificationToolchainIdentity = {
  hardkas: { version: "0.12.0-rc.28" },
  kaspaWasm: { version: "2.0.1", digest: "7eaffac9cd920ef2fdf540c6e10f2a2b7761170ebc62ec57dfa0f71c64567a71" }
};

function successfulPlan(): PlanAndSignResult {
  return {
    txid: TXID,
    signedTransaction: { opaque: true },
    plannerAuthority: "KASPA_WASM_GENERATOR",
    plannerAuthorityDetail: "kaspa-wasm@2.0.1",
    mass: 2500n,
    fee: 250_000n,
    outputs: [{ address: DEST_ADDR, amountSompi: 1_000_000_000n }],
    changeAddress: FUND_ADDR,
    changeAmountSompi: 498_999_750_000n
  };
}

function productPath(planImpl: () => Promise<PlanAndSignResult>): ProductTransactionPath {
  return { planAndSign: vi.fn(planImpl) };
}

function scriptedSubmit(input: {
  submitImpl: () => Promise<{ transactionId?: string }>;
  mempool: readonly ({ txid: string } | null)[];
  utxos: readonly (readonly DaaObserverUtxoRow[])[];
}): SubmissionGuardRpc & { calls: { submit: number; mempool: number; utxos: number } } {
  const calls = { submit: 0, mempool: 0, utxos: 0 };
  return {
    calls,
    async submitTransaction(_signedTx: unknown) { calls.submit++; return input.submitImpl(); },
    async getMempoolEntry(_txid: string) {
      const i = Math.min(calls.mempool, input.mempool.length - 1);
      calls.mempool++;
      return input.mempool[i] ?? null;
    },
    async getUtxosByAddress(_addr: string) {
      const i = Math.min(calls.utxos, input.utxos.length - 1);
      calls.utxos++;
      return input.utxos[i] ?? [];
    }
  } as any;
}

function scriptedObserver(input: {
  mempool: readonly ({ txid: string } | null)[];
  utxos: readonly (readonly DaaObserverUtxoRow[])[];
}): DaaObserverRpc & { calls: { mempool: number; utxos: number } } {
  const calls = { mempool: 0, utxos: 0 };
  return {
    calls,
    async getMempoolEntry(_txid: string) {
      const i = Math.min(calls.mempool, input.mempool.length - 1);
      calls.mempool++;
      return input.mempool[i] ?? null;
    },
    async getUtxosByAddress(_addr: string) {
      const i = Math.min(calls.utxos, input.utxos.length - 1);
      calls.utxos++;
      return input.utxos[i] ?? [];
    }
  } as any;
}

function utxoAt(txid: string, blockDaaScore?: bigint): DaaObserverUtxoRow {
  return blockDaaScore !== undefined
    ? { outpoint: { transactionId: txid, index: 0 }, amountSompi: 1n, blockDaaScore }
    : { outpoint: { transactionId: txid, index: 0 }, amountSompi: 1n };
}

// TN10-CONFIRMATION-FIX-1: the product chain observer, scripted. Default: the virtual chain names block cc…cc (DAA 100,
// the UTXO rows' blockDaaScore) at 150 blue-score confirmations.
const ACCEPTING_BLOCK = "cc".repeat(32);
const START_SINK = "dd".repeat(32);
function scriptedChain(
  findings: readonly ChainLookFinding[] = [
    { type: "accepted", acceptingBlockHash: ACCEPTING_BLOCK, acceptingBlueScore: 1_000n, acceptingDaaScore: 100n, confirmationsBlue: 150n, finalityReached: false }
  ],
  opts: { startPointError?: Error } = {}
): ChainAcceptanceObserver & { calls: { start: number; look: number; since: string[] } } {
  const calls = { start: 0, look: 0, since: [] as string[] };
  return {
    calls,
    async captureStartPoint() {
      calls.start++;
      if (opts.startPointError) throw opts.startPointError;
      return { sinkHash: START_SINK, sinkBlueScore: 990n, virtualDaaScore: 90n, capturedAt: STARTED_AT.toISOString() };
    },
    async look({ since }) {
      const finding = findings[Math.min(calls.look, findings.length - 1)]!;
      calls.look++;
      calls.since.push(since);
      return {
        observationArtifactId: "ee".repeat(32),
        observedAt: STARTED_AT.toISOString(),
        observerId: `obs_${"ff".repeat(32)}`,
        point: { sinkHash: "99".repeat(32), sinkBlueScore: 1_150n, virtualDaaScore: 251n },
        finding,
        derivedStatus: finding.type === "accepted" ? (finding.confirmationsBlue >= 100n ? "CONFIRMED" : "ACCEPTED") : "INSUFFICIENT_EVIDENCE"
      };
    }
  };
}
// --- happy path --------------------------------------------------------------

describe("runQualification — happy path", () => {
  it("full pipeline PASS: plan/sign → SUBMITTED → acceptance → inclusion → confirmation → raw + shared persisted", async () => {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir("hk-tq-runner-shared-");

    const submissionRpc = scriptedSubmit({
      submitImpl: async () => ({ transactionId: TXID }),
      mempool: [null],
      utxos: [[]]
    });
    const observerRpc = scriptedObserver({
      // acceptance polling: mempool empty, then UTXO appears
      mempool: [null, null, null],
      utxos: [[], [], [utxoAt(TXID, 100n)]]
    });

    const input: RunnerInput = {
      qualificationId: "tq-run-happy",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      sharedDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 1000 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 1000 }
      }
    };

    const outcome = await runQualification(input);
    expect(outcome.qualification.outcome).toBe("PASS");
    expect(submissionRpc.calls.submit).toBe(1);
    expect(outcome.evidencePersistence.raw).toBe("persisted");
    expect(outcome.evidencePersistence.shared).toBe("persisted");
    expect(outcome.evidencePersistence.rawFilePath).toBeDefined();
    expect(outcome.evidencePersistence.sharedFilePath).toBeDefined();
    expect(outcome.sharedReceipt).toBeDefined();
    // The shared receipt's derivedFrom.digest must equal the persisted raw's digest.
    expect(outcome.sharedReceipt!.derivedFrom.digest).toBe(outcome.evidencePersistence.rawDigest);
  });
});

// --- 4 mandatory adversarial cases -------------------------------------------

describe("Adversarial 1 — transport ambiguity, no positive observation", () => {
  it("→ UNRESOLVED with submit count == 1 and receipt preserves the ambiguity", async () => {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir();

    const submissionRpc = scriptedSubmit({
      submitImpl: async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); },
      mempool: [null, null, null],
      utxos: [[], [], []]
    });
    const observerRpc = scriptedObserver({ mempool: [null], utxos: [[]], });

    const outcome = await runQualification({
      qualificationId: "tq-adv1",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      sharedDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        submissionOptions: { probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 }
      }
    });

    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker?.code).toBe("SUBMIT_TRANSPORT_AMBIGUITY_UNRESOLVED");
    expect(submissionRpc.calls.submit).toBe(1);
    // Raw receipt preserves the ambiguity: submission state UNRESOLVED, no inclusion/confirmation.
    expect(outcome.receipt.outcome).toBe("UNRESOLVED");
    expect(outcome.receipt.evidence.submissions![0]!.state).toBe("UNRESOLVED");
    expect(outcome.receipt.evidence.chainAcceptances).toBeUndefined();
    expect(outcome.receipt.evidence.blueConfirmations).toBeUndefined();
    // Raw persistence should still succeed.
    expect(outcome.evidencePersistence.raw).toBe("persisted");
  });
});

describe("Adversarial 2 — transport ambiguity resolved positively", () => {
  it("→ OBSERVED_MEMPOOL / OBSERVED_ACCEPTED with submit count == 1 and no resubmission", async () => {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir();

    const submissionRpc = scriptedSubmit({
      submitImpl: async () => { throw Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }); },
      mempool: [{ txid: TXID }], // guard finds it in mempool
      utxos: [[]]
    });
    // Observer sees the tx already in the utxo set on witness address so
    // acceptance → inclusion → confirmation all succeed.
    const observerRpc = scriptedObserver({
      mempool: [null],
      utxos: [[utxoAt(TXID, 100n)]]
    });

    const outcome = await runQualification({
      qualificationId: "tq-adv2",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      sharedDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 3),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        submissionOptions: { probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 },
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 100 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 100 }
      }
    });

    expect(submissionRpc.calls.submit).toBe(1);
    // Submission state is OBSERVED_MEMPOOL (from the guard) — never resubmitted.
    expect(outcome.receipt.evidence.submissions![0]!.state).toBe("OBSERVED_MEMPOOL");
    // Full pipeline completed once observer picks up the tx.
    expect(outcome.qualification.outcome).toBe("PASS");
    expect(outcome.receipt.evidence.blueConfirmations).toBeDefined();
  });
});

describe("Adversarial 3 — funding race after initial validation", () => {
  it("→ FAIL when the product path rejects because the input is no longer spendable (no UTXO substitution)", async () => {
    const rawDir = await tmpDir();

    // Simulate: planAndSign observes that the declared UTXO is spent and refuses to proceed.
    const path: ProductTransactionPath = {
      planAndSign: vi.fn(async () => {
        throw Object.assign(new Error("Declared funding outpoint has been spent"), { code: "FUNDING_RACE" });
      })
    };
    const submissionRpc = scriptedSubmit({ submitImpl: async () => ({}), mempool: [null], utxos: [[]] });
    const observerRpc = scriptedObserver({ mempool: [null], utxos: [[]], });

    const outcome = await runQualification({
      qualificationId: "tq-adv3",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: path,
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations"
      }
    });

    expect(outcome.qualification.outcome).toBe("FAIL");
    expect(outcome.qualification.blocker?.stage).toBe("plan-and-sign");
    expect(outcome.qualification.blocker?.code).toBe("FUNDING_RACE");
    // No submission happened.
    expect(submissionRpc.calls.submit).toBe(0);
    // No UTXO substitution: outputs / plan absent from evidence.
    expect(outcome.receipt.evidence.submissions).toBeUndefined();
    expect(outcome.receipt.evidence.chainAcceptances).toBeUndefined();
    // Raw receipt still persisted for evidence.
    expect(outcome.evidencePersistence.raw).toBe("persisted");
  });
});

describe("Adversarial 4 — receipt persistence failure after network action", () => {
  it("→ network qualification outcome unchanged; raw persistence marked failed; no second network action", async () => {
    // Rig: pass a rawDir path that is a FILE (not a directory) so mkdir/open fails.
    // Sanity check: this leaves any prior network action untouched.
    const bogusDir = await tmpDir();
    // Turn the dir into a file-like unusable path: create a *file* whose
    // name we then re-use as the target rawDir. Attempting to mkdir over
    // an existing file fails on both POSIX and Windows.
    const forbidden = path.join(bogusDir, "not-a-dir");
    await fs.writeFile(forbidden, "occupied");

    const submissionRpc = scriptedSubmit({
      submitImpl: async () => ({ transactionId: TXID }),
      mempool: [null],
      utxos: [[]]
    });
    const observerRpc = scriptedObserver({
      mempool: [null, null, null],
      utxos: [[], [], [utxoAt(TXID, 100n)]]
    });

    const outcome = await runQualification({
      qualificationId: "tq-adv4",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir: forbidden,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 100 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 100 }
      }
    });

    // Network qualification completed = PASS (submit succeeded, confirmations observed).
    expect(outcome.qualification.outcome).toBe("PASS");
    expect(submissionRpc.calls.submit).toBe(1);
    // Raw persistence FAILED — but that is an independent dimension.
    expect(outcome.evidencePersistence.raw).toBe("failed");
    expect(outcome.evidencePersistence.errors?.some((e) => e.stage === "raw")).toBe(true);
    // No shared attempt when raw failed.
    expect(outcome.evidencePersistence.shared).toBe("not-attempted");
    // No second submission was attempted to "recreate" evidence.
    expect(submissionRpc.calls.submit).toBe(1);
    // Original network action's txid remains in the in-memory receipt.
    expect(outcome.receipt.evidence.submissions![0]!.txid).toBe(TXID);
  });
});

// --- SAFE_TO_RETRY and observation-state separation --------------------------

describe("Consensus rejection is FAIL, never patched inside TQ", () => {
  it("→ FAIL with CONSENSUS_PRE_MEMPOOL_REJECTION blocker; TQ does NOT rewrite the tx or retry", async () => {
    const rawDir = await tmpDir();
    const submissionRpc = scriptedSubmit({
      submitImpl: async () => { throw new Error("Transaction rejected: invalid signature"); },
      mempool: [null],
      utxos: [[]]
    });
    const observerRpc = scriptedObserver({ mempool: [null], utxos: [[]], });

    const outcome = await runQualification({
      qualificationId: "tq-safe-retry",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations"
      }
    });

    expect(outcome.qualification.outcome).toBe("FAIL");
    expect(outcome.qualification.blocker?.code).toBe("CONSENSUS_PRE_MEMPOOL_REJECTION");
    expect(submissionRpc.calls.submit).toBe(1);
    // TQ never rewrites the tx; the blocker is recorded in evidence.notes.
    expect(outcome.receipt.evidence.notes).toBeDefined();
    expect((outcome.receipt.evidence.notes as any).blocker.code).toBe("CONSENSUS_PRE_MEMPOOL_REJECTION");
  });
});

describe("Observation semantics separation", () => {
  it("does NOT collapse submission/mempool/acceptance/inclusion/confirmation labels", async () => {
    const rawDir = await tmpDir();
    const submissionRpc = scriptedSubmit({
      submitImpl: async () => ({ transactionId: TXID }),
      mempool: [null],
      utxos: [[]]
    });
    const observerRpc = scriptedObserver({
      mempool: [null, null, null],
      utxos: [[], [], [utxoAt(TXID, 100n)]]
    });

    const outcome = await runQualification({
      qualificationId: "tq-labels",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 100 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 100 }
      }
    });

    // All five distinct fields present in the receipt.
    expect(outcome.receipt.evidence.submissions).toBeDefined();
    expect(outcome.receipt.evidence.acceptances).toBeDefined();
    expect(outcome.receipt.evidence.chainAcceptances).toBeDefined();
    expect(outcome.receipt.evidence.blueConfirmations).toBeDefined();
    const serialized = JSON.stringify(outcome.receipt);
    expect(/"final"/i.test(serialized)).toBe(false);
    expect(/"consensus-valid"/i.test(serialized)).toBe(false);
  });
});

// --- runStandardL1Scenario is directly re-exported and callable ------------

describe("runStandardL1Scenario direct use", () => {
  it("returns a scenario result without touching persistence", async () => {
    const submissionRpc = scriptedSubmit({
      submitImpl: async () => ({ transactionId: TXID }),
      mempool: [null],
      utxos: [[]]
    });
    const observerRpc = scriptedObserver({
      mempool: [null, null, null],
      utxos: [[], [], [utxoAt(TXID, 100n)]]
    });

    const result = await runStandardL1Scenario({
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      productPath: productPath(async () => successfulPlan()),
      submissionRpc,
      observerRpc,
      fromAddress: FUND_ADDR,
      toAddress: DEST_ADDR,
      amountSompi: 1_000_000_000n,
      chainObserver: scriptedChain(),
      minConfirmations: 100n,
      minConfirmationsRequestedVia: "--min-confirmations",
      acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 100 },
      confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 100 },
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep
    });

    expect(result.outcome).toBe("PASS");
    expect(result.plan).toBeDefined();
    expect(result.submission).toBeDefined();
    expect(result.confirmation).toBeDefined();
    expect(result.blocker).toBeUndefined();
  });
});

// TQ1-SCRIPT-BROKEN-1 (D7, review 2026-10-15): the receipt's explicit record of the ONE submitTransaction call.
describe("D7 — submission attempt record", () => {
  async function runWith(submitImpl: () => Promise<{ transactionId?: string }>, planImpl: () => Promise<PlanAndSignResult> = async () => successfulPlan()) {
    const rawDir = await tmpDir();
    const submissionRpc = scriptedSubmit({ submitImpl, mempool: [null, null, null], utxos: [[], [], []] });
    const outcome = await runQualification({
      qualificationId: "tq-d7",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(planImpl),
        submissionRpc,
        observerRpc: scriptedObserver({ mempool: [null], utxos: [[]], }),
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        submissionOptions: { probeWaitBeforeMs: 0, probeMaxWaitMs: 10, probePollIntervalMs: 1 }
      }
    });
    return { outcome, submissionRpc };
  }

  it("stopped at plan-and-sign → not_attempted, attempts 0, stage plan-and-sign; no submission record, nothing called", async () => {
    const { outcome, submissionRpc } = await runWith(async () => ({}), async () => {
      throw Object.assign(new Error("keystore locked"), { code: "KEYSTORE_PASSWORD_REQUIRED" });
    });
    expect(submissionRpc.calls.submit).toBe(0);
    expect(outcome.receipt.evidence.submissions).toBeUndefined();
    expect(outcome.receipt.evidence.submissionAttempts).toEqual([
      expect.objectContaining({ outcome: "not_attempted", attempts: 0, stage: "plan-and-sign", reason: "KEYSTORE_PASSWORD_REQUIRED" })
    ]);
  });

  it("a client refusal before sending → not_attempted, attempts 0, stage submit, FAIL with the client's code", async () => {
    const { outcome } = await runWith(async () => {
      throw Object.assign(new Error("no endpoint chosen"), { code: "NETWORK_ENDPOINT_REQUIRED" });
    });
    expect(outcome.qualification.outcome).toBe("FAIL");
    expect(outcome.qualification.blocker?.code).toBe("NETWORK_ENDPOINT_REQUIRED");
    expect(outcome.receipt.evidence.submissionAttempts).toEqual([
      expect.objectContaining({ outcome: "not_attempted", attempts: 0, stage: "submit", txid: TXID })
    ]);
  });

  it("accepted → attempts 1 / accepted", async () => {
    const { outcome, submissionRpc } = await runWith(async () => ({ transactionId: TXID }));
    expect(submissionRpc.calls.submit).toBe(1);
    expect(outcome.receipt.evidence.submissionAttempts).toEqual([
      expect.objectContaining({ outcome: "accepted", attempts: 1, stage: "submit", reason: "first-attempt" })
    ]);
  });

  it("explicit rejection → attempts 1 / rejected, FAIL, never retried", async () => {
    const { outcome, submissionRpc } = await runWith(async () => { throw new Error("Transaction rejected: invalid signature"); });
    expect(submissionRpc.calls.submit).toBe(1);
    expect(outcome.qualification.outcome).toBe("FAIL");
    expect(outcome.receipt.evidence.submissionAttempts).toEqual([expect.objectContaining({ outcome: "rejected", attempts: 1 })]);
  });

  it("an answer the guard cannot classify → attempts 1 / outcome_unknown, UNRESOLVED SUBMIT_OUTCOME_UNKNOWN, never retried, never 'accepted: false'", async () => {
    const { outcome, submissionRpc } = await runWith(async () => { throw new Error("fake node: submissions refused"); });
    expect(submissionRpc.calls.submit).toBe(1);
    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker?.code).toBe("SUBMIT_OUTCOME_UNKNOWN");
    expect(outcome.receipt.evidence.submissionAttempts).toEqual([
      expect.objectContaining({ outcome: "outcome_unknown", attempts: 1, reason: "unclassified-error-no-positive-observation" })
    ]);
    expect(outcome.receipt.evidence.submissions![0]!.state).toBe("UNRESOLVED");
    expect(JSON.stringify(outcome.receipt)).not.toMatch(/"accepted":\s*false/);
  });
});
// Review 2026-10-15, D7 control: a generic RPC error must not become `rejected` merely because submitTransaction threw
// (the node may have received the tx and the answer been lost), and the independent status query that follows must
// NOT rewrite, after the fact, that the original answer was ambiguous. The attempt record keeps what the ANSWER
// established; what the later query observed stays in `submissions[].state` / `resolvedVia` and the observation slots.
describe("D7 control — an ambiguous submit answer stays ambiguous in the attempt record", () => {
  async function run(submitImpl: () => Promise<{ transactionId?: string }>, guardSees: { mempool: ({ txid: string } | null)[]; utxos: DaaObserverUtxoRow[][] }, observerSeesTx: boolean) {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir();
    const submissionRpc = scriptedSubmit({ submitImpl, mempool: guardSees.mempool, utxos: guardSees.utxos });
    const observerRpc = scriptedObserver({
      mempool: [null],
      utxos: observerSeesTx ? [[utxoAt(TXID, 100n)]] : [[]]
    });
    const outcome = await runQualification({
      qualificationId: "tq-d7-control",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      sharedDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 3),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        chainObserver: scriptedChain(),
        minConfirmations: 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        submissionOptions: { probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 },
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 20 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 20 }
      }
    });
    const onDisk = JSON.parse(await fs.readFile(outcome.evidencePersistence.rawFilePath!, "utf8"));
    const shared = JSON.parse(await fs.readFile(outcome.evidencePersistence.sharedFilePath!, "utf8"));
    return { outcome, submissionRpc, onDisk, shared };
  }
  const UNKNOWN_ONE = expect.objectContaining({ outcome: "outcome_unknown", attempts: 1, stage: "submit", txid: TXID });

  const generic: Array<[string, () => Promise<never>]> = [
    ["a generic RPC error text", async () => { throw new Error("RPC error: internal error"); }],
    ["a JSON-RPC error object with a numeric code", async () => { throw { code: -32603, message: "Internal error" }; }],
    ["a lost response (connection reset after sending)", async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); }]
  ];
  for (const [label, submitImpl] of generic) {
    it(`${label}, nothing observed → attempts 1 / outcome_unknown (never rejected), one call, UNRESOLVED`, async () => {
      const { outcome, submissionRpc, onDisk, shared } = await run(submitImpl, { mempool: [null, null, null], utxos: [[], [], []] }, false);
      expect(submissionRpc.calls.submit).toBe(1); // zero retries
      expect(outcome.qualification.outcome).toBe("UNRESOLVED");
      for (const ev of [outcome.receipt.evidence, onDisk.evidence, shared.evidence]) {
        expect(ev.submissionAttempts).toEqual([UNKNOWN_ONE]);
        expect(JSON.stringify(ev.submissionAttempts)).not.toMatch(/rejected|not_attempted|"accepted"/);
      }
    });
  }

  for (const [label, guardSees, state, via] of [
    ["the independent query then finds it in the mempool", { mempool: [{ txid: TXID }], utxos: [[]] }, "OBSERVED_MEMPOOL", "unclassified-error-mempool-hit"],
    ["the independent query then finds its output UTXO", { mempool: [null], utxos: [[utxoAt(TXID)]] }, "OBSERVED_ACCEPTED", "unclassified-error-utxo-hit"]
  ] as const) {
    it(`a generic RPC error, ${label}, and the run even reaches PASS → the attempt record STILL says outcome_unknown / attempts 1; the observation is recorded separately`, async () => {
      const { outcome, submissionRpc, onDisk, shared } = await run(async () => { throw new Error("RPC error: internal error"); }, guardSees as any, true);
      expect(submissionRpc.calls.submit).toBe(1); // zero retries
      expect(outcome.qualification.outcome).toBe("PASS");
      for (const ev of [outcome.receipt.evidence, onDisk.evidence, shared.evidence]) {
        // the answer was ambiguous — the later observation does not rewrite that
        expect(ev.submissionAttempts).toEqual([expect.objectContaining({ outcome: "outcome_unknown", attempts: 1, reason: via })]);
        // what the independent query saw lives in the guard's record and the observation slots
        expect(ev.submissions[0].state).toBe(state);
        expect(ev.submissions[0].resolvedVia).toBe(via);
        expect(ev.blueConfirmations).toHaveLength(1);
      }
    });
  }

  it("only an answer the node actually gave as acceptance is `accepted` (SUBMITTED, first attempt)", async () => {
    const { outcome } = await run(async () => ({ transactionId: TXID }), { mempool: [null], utxos: [[]] }, true);
    expect(outcome.receipt.evidence.submissionAttempts).toEqual([expect.objectContaining({ outcome: "accepted", attempts: 1, reason: "first-attempt" })]);
  });
});

// TN10-CONFIRMATION-FIX-1 (review 2026-10-15): confirmation = blue-score depth of the ACCEPTING CHAIN BLOCK named by the
// virtual chain from a start point captured before the submission, bound to the UTXO row. UTXO presence alone never
// confirms; the single-submission contract and the ambiguity guard are unchanged.
describe("TN10-CONFIRMATION-FIX-1 — accepting chain block, blue-score confirmation, receipt v3", () => {
  async function runChain(
    chainObserver: ReturnType<typeof scriptedChain>,
    opts: { observerUtxos?: readonly (readonly DaaObserverUtxoRow[])[]; minConfirmations?: bigint; submitImpl?: () => Promise<{ transactionId?: string }> } = {}
  ) {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir("hk-tq-runner-shared-");
    const submissionRpc = scriptedSubmit({ submitImpl: opts.submitImpl ?? (async () => ({ transactionId: TXID })), mempool: [null], utxos: [[]] });
    const observerRpc = scriptedObserver({ mempool: [null], utxos: opts.observerUtxos ?? [[utxoAt(TXID, 100n)]] });
    const outcome = await runQualification({
      qualificationId: "tq-chain",
      toolchain: TOOLCHAIN,
      authority: AUTHORITY,
      fundingEvidence: FUNDING,
      rawDir,
      sharedDir,
      startedAt: STARTED_AT,
      now: advancingClock("2026-09-15T15:00:00.000Z", 5),
      sleep: noSleep,
      standardL1: {
        productPath: productPath(async () => successfulPlan()),
        submissionRpc,
        observerRpc,
        chainObserver,
        fromAddress: FUND_ADDR,
        toAddress: DEST_ADDR,
        amountSompi: 1_000_000_000n,
        minConfirmations: opts.minConfirmations ?? 100n,
        minConfirmationsRequestedVia: "--min-confirmations",
        submissionOptions: { probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 },
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 50 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 50 }
      }
    });
    const onDisk = outcome.evidencePersistence.rawFilePath ? JSON.parse(await fs.readFile(outcome.evidencePersistence.rawFilePath, "utf8")) : undefined;
    const shared = outcome.evidencePersistence.sharedFilePath ? JSON.parse(await fs.readFile(outcome.evidencePersistence.sharedFilePath, "utf8")) : undefined;
    return { outcome, submissionRpc, onDisk, shared };
  }

  it("CF-1 PASS: the start point is captured before the submit, the chain is scanned from it, and the v3 receipt names the accepting block, its blue-score confirmations and the policy", async () => {
    const chain = scriptedChain();
    const { outcome, submissionRpc, onDisk, shared } = await runChain(chain);
    expect(outcome.qualification.outcome).toBe("PASS");
    expect(submissionRpc.calls.submit).toBe(1);
    expect(chain.calls.start).toBe(1);
    expect(chain.calls.since.every((s) => s === START_SINK)).toBe(true);
    expect(onDisk.schemaVersion).toBe(3);
    expect(onDisk.evidence.inclusions).toBeUndefined();
    expect(onDisk.evidence.confirmations).toBeUndefined();
    expect(onDisk.evidence.startPoints).toEqual([expect.objectContaining({ sinkHash: START_SINK, sinkBlueScore: "990" })]);
    expect(onDisk.evidence.chainAcceptances).toEqual([
      expect.objectContaining({
        method: "virtual-chain-from-submit-start-point",
        acceptingBlockHash: ACCEPTING_BLOCK,
        acceptingBlueScore: "1000",
        acceptingDaaScore: "100",
        utxoBinding: expect.objectContaining({ result: "matches", utxoBlockDaaScore: "100", acceptingDaaScore: "100" }),
        observation: expect.objectContaining({ observationArtifactId: "ee".repeat(32) })
      })
    ]);
    expect(onDisk.evidence.blueConfirmations).toEqual([
      expect.objectContaining({
        acceptingBlockHash: ACCEPTING_BLOCK,
        confirmationsBlue: "150",
        unit: "blue-score",
        observedStatus: "CONFIRMED",
        policy: { minConfirmations: "100", unit: "blue-score", requestedVia: "--min-confirmations", satisfied: true },
        limitations: expect.arrayContaining([expect.stringMatching(/ONE RPC node/), expect.stringMatching(/revertible until finality/)])
      })
    ]);
    // the RPC answer, the UTXO-level signal and the chain evidence stay in separate slots
    expect(onDisk.evidence.submissions[0].state).toBe("SUBMITTED");
    expect(onDisk.evidence.acceptances[0].detectedVia).toBeDefined();
    expect(shared.schemaVersion).toBe(3);
    expect(shared.derivedFrom.rawSchemaVersion).toBe(3);
    expect(shared.evidence.blueConfirmations[0].confirmationsBlue).toBe("150");
  });

  it("CF-2 the outputs are in the UTXO set but the virtual chain never names an accepting block → UNRESOLVED ACCEPTANCE_BLOCK_NOT_FOUND, never confirmed", async () => {
    const { outcome, submissionRpc, onDisk } = await runChain(scriptedChain([{ type: "not_found", scannedChainBlocks: 1840 }]));
    expect(submissionRpc.calls.submit).toBe(1);
    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker).toMatchObject({ stage: "acceptance-block", code: "ACCEPTANCE_BLOCK_NOT_FOUND" });
    expect(onDisk.evidence.acceptances).toHaveLength(1); // UTXO-level signal recorded …
    expect(onDisk.evidence.chainAcceptances).toBeUndefined(); // … but no block, no confirmation
    expect(onDisk.evidence.blueConfirmations).toBeUndefined();
    expect(onDisk.evidence.chainLooks).toEqual([expect.objectContaining({ finding: { type: "not_found", scannedChainBlocks: 1840 } })]);
  });

  it("CF-3 the virtual chain names a block whose DAA score is not the UTXO row's → UNRESOLVED ACCEPTANCE_UTXO_CONFLICT", async () => {
    const { outcome, onDisk } = await runChain(
      scriptedChain([{ type: "accepted", acceptingBlockHash: ACCEPTING_BLOCK, acceptingBlueScore: 1_000n, acceptingDaaScore: 101n, confirmationsBlue: 500n, finalityReached: false }])
    );
    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker?.code).toBe("ACCEPTANCE_UTXO_CONFLICT");
    expect(onDisk.evidence.chainAcceptances[0].utxoBinding).toMatchObject({ result: "mismatch", utxoBlockDaaScore: "100", acceptingDaaScore: "101" });
    expect(onDisk.evidence.blueConfirmations).toBeUndefined();
  });

  it("CF-4 accepted but short of the blue-score threshold (whatever the DAA delta) → UNRESOLVED CONFIRMATION_TIMEOUT with the accepting block recorded, no confirmation", async () => {
    const { outcome, onDisk } = await runChain(
      scriptedChain([{ type: "accepted", acceptingBlockHash: ACCEPTING_BLOCK, acceptingBlueScore: 1_000n, acceptingDaaScore: 100n, confirmationsBlue: 60n, confirmationsDaa: 121n, finalityReached: false }])
    );
    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker).toMatchObject({ stage: "confirmation", code: "CONFIRMATION_TIMEOUT" });
    expect(onDisk.evidence.chainAcceptances[0].acceptingBlockHash).toBe(ACCEPTING_BLOCK);
    expect(onDisk.evidence.blueConfirmations).toBeUndefined();
  });

  it("CF-5 the start point cannot be read → FAIL START_POINT_UNAVAILABLE, nothing submitted (attempts 0)", async () => {
    const { outcome, submissionRpc, onDisk } = await runChain(scriptedChain(undefined, { startPointError: new Error("socket closed") }));
    expect(submissionRpc.calls.submit).toBe(0);
    expect(outcome.qualification.outcome).toBe("FAIL");
    expect(outcome.qualification.blocker).toMatchObject({ stage: "start-point", code: "START_POINT_UNAVAILABLE" });
    expect(onDisk.evidence.submissionAttempts).toEqual([expect.objectContaining({ outcome: "not_attempted", attempts: 0, stage: "submit" })]);
  });

  it("CF-6 the node cannot serve the chain from the start point (pruned/unknown) → UNRESOLVED ACCEPTANCE_CHAIN_UNAVAILABLE, the chain is not inferred", async () => {
    const chain = scriptedChain();
    chain.look = async () => {
      throw Object.assign(new Error("cannot find header dd…"), { code: "OBSERVE_SINCE_UNAVAILABLE" });
    };
    const { outcome, submissionRpc, onDisk } = await runChain(chain);
    expect(submissionRpc.calls.submit).toBe(1);
    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker?.code).toBe("ACCEPTANCE_CHAIN_UNAVAILABLE");
    expect(onDisk.evidence.blueConfirmations).toBeUndefined();
  });

  it("CF-7 the accepting block is reached only after more blue score accumulates: confirmed on a later look, still one submit", async () => {
    const chain = scriptedChain([
      { type: "mempool" },
      { type: "accepted", acceptingBlockHash: ACCEPTING_BLOCK, acceptingBlueScore: 1_000n, acceptingDaaScore: 100n, confirmationsBlue: 20n, finalityReached: false },
      { type: "accepted", acceptingBlockHash: ACCEPTING_BLOCK, acceptingBlueScore: 1_000n, acceptingDaaScore: 100n, confirmationsBlue: 100n, finalityReached: false }
    ]);
    const { outcome, submissionRpc, onDisk } = await runChain(chain);
    expect(outcome.qualification.outcome).toBe("PASS");
    expect(submissionRpc.calls.submit).toBe(1);
    expect(chain.calls.look).toBe(3);
    expect(onDisk.evidence.blueConfirmations[0].confirmationsBlue).toBe("100");
  });

  it("CF-8 an ambiguous submit answer stays outcome_unknown / attempts 1 while the chain evidence is recorded separately", async () => {
    const { outcome, submissionRpc, onDisk } = await runChain(scriptedChain(), {
      submitImpl: async () => { throw new Error("RPC error: internal error"); }
    });
    expect(submissionRpc.calls.submit).toBe(1);
    // the guard saw nothing (its scripted view is empty) → UNRESOLVED before any chain stage; never resubmitted
    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(onDisk.evidence.submissionAttempts).toEqual([expect.objectContaining({ outcome: "outcome_unknown", attempts: 1 })]);
    expect(onDisk.evidence.blueConfirmations).toBeUndefined();
  });
});
