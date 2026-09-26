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
  hardkas: { version: "0.12.0-rc.23" },
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
  dagVirtual: readonly bigint[];
}): DaaObserverRpc & { calls: { mempool: number; utxos: number; dag: number } } {
  const calls = { mempool: 0, utxos: 0, dag: 0 };
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
    },
    async getBlockDagInfo() {
      const i = Math.min(calls.dag, input.dagVirtual.length - 1);
      calls.dag++;
      return { virtualDaaScore: input.dagVirtual[i] ?? 0n };
    }
  } as any;
}

function utxoAt(txid: string, blockDaaScore?: bigint): DaaObserverUtxoRow {
  return blockDaaScore !== undefined
    ? { outpoint: { transactionId: txid, index: 0 }, amountSompi: 1n, blockDaaScore, blockHash: "cc".repeat(32) }
    : { outpoint: { transactionId: txid, index: 0 }, amountSompi: 1n };
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
      utxos: [[], [], [utxoAt(TXID, 100n)]],
      dagVirtual: [150n]
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
        configuredDaaDelta: 10n,
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
    const observerRpc = scriptedObserver({ mempool: [null], utxos: [[]], dagVirtual: [0n] });

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
        configuredDaaDelta: 10n,
        submissionOptions: { probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 }
      }
    });

    expect(outcome.qualification.outcome).toBe("UNRESOLVED");
    expect(outcome.qualification.blocker?.code).toBe("SUBMIT_TRANSPORT_AMBIGUITY_UNRESOLVED");
    expect(submissionRpc.calls.submit).toBe(1);
    // Raw receipt preserves the ambiguity: submission state UNRESOLVED, no inclusion/confirmation.
    expect(outcome.receipt.outcome).toBe("UNRESOLVED");
    expect(outcome.receipt.evidence.submissions![0]!.state).toBe("UNRESOLVED");
    expect(outcome.receipt.evidence.inclusions).toBeUndefined();
    expect(outcome.receipt.evidence.confirmations).toBeUndefined();
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
      utxos: [[utxoAt(TXID, 100n)]],
      dagVirtual: [200n]
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
        configuredDaaDelta: 10n,
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
    expect(outcome.receipt.evidence.confirmations).toBeDefined();
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
    const observerRpc = scriptedObserver({ mempool: [null], utxos: [[]], dagVirtual: [0n] });

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
        configuredDaaDelta: 10n
      }
    });

    expect(outcome.qualification.outcome).toBe("FAIL");
    expect(outcome.qualification.blocker?.stage).toBe("plan-and-sign");
    expect(outcome.qualification.blocker?.code).toBe("FUNDING_RACE");
    // No submission happened.
    expect(submissionRpc.calls.submit).toBe(0);
    // No UTXO substitution: outputs / plan absent from evidence.
    expect(outcome.receipt.evidence.submissions).toBeUndefined();
    expect(outcome.receipt.evidence.inclusions).toBeUndefined();
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
      utxos: [[], [], [utxoAt(TXID, 100n)]],
      dagVirtual: [200n]
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
        configuredDaaDelta: 10n,
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
    const observerRpc = scriptedObserver({ mempool: [null], utxos: [[]], dagVirtual: [0n] });

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
        configuredDaaDelta: 10n
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
      utxos: [[], [], [utxoAt(TXID, 100n)]],
      dagVirtual: [200n]
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
        configuredDaaDelta: 10n,
        acceptanceOptions: { pollIntervalMs: 1, maxWaitMs: 100 },
        confirmationOptions: { pollIntervalMs: 1, maxWaitMs: 100 }
      }
    });

    // All five distinct fields present in the receipt.
    expect(outcome.receipt.evidence.submissions).toBeDefined();
    expect(outcome.receipt.evidence.acceptances).toBeDefined();
    expect(outcome.receipt.evidence.inclusions).toBeDefined();
    expect(outcome.receipt.evidence.confirmations).toBeDefined();
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
      utxos: [[], [], [utxoAt(TXID, 100n)]],
      dagVirtual: [200n]
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
      configuredDaaDelta: 10n,
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
