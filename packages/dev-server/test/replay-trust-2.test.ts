import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, parseKasToSompi } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { createInitialLocalnetState, applySimulatedPayment, verifyReplay } from "@hardkas/localnet";
import { HardkasStore, HardkasIndexer } from "@hardkas/query-store";

// REPLAY-TRUST-2 (investigation, 2026-10-05, base 43d30e4f5) · BEFORE for D4: how the dashboard presents stored replay
// verdicts. EVIDENCE-DIFF-REDACTION-1 marked reports whose receipt was compared raw (`receiptComparison: "raw"`);
// reports without it were decided on a masked comparison and are legacy (decision D4: legacy/untrusted, re-verify,
// never rewritten). The transactions route derives PASS/FAIL from the first report with the txId
// (`planOk && receiptOk && invariantsOk`, absent counting as true) and reads neither the marker nor the report's
// integrity. The workspace below holds four payments, each with exactly one report.

const ctx = systemRuntimeContext;
const reseal = (a: any) => {
  const x = structuredClone(a);
  delete x.contentHash;
  if (x.lineage) delete x.lineage.artifactId;
  const h = calculateContentHash(x, CURRENT_HASH_VERSION);
  x.contentHash = h;
  if (x.lineage) x.lineage = { ...x.lineage, artifactId: h };
  return x;
};

let ws: string;
let previousRoot: string | undefined;
const txIds: Record<"raw" | "diverged" | "legacy" | "tampered", string> = {} as any;

beforeAll(async () => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rt2-dash-"));
  const store = path.join(ws, ".hardkas", "artifacts");
  fs.mkdirSync(path.join(store, "receipts"), { recursive: true });

  let state: any = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("100") });
  const runs: Array<{ before: any; plan: any; receipt: any }> = [];
  for (let i = 1; i <= 4; i++) {
    const before = state;
    const r = applySimulatedPayment(state, { from: "alice", to: "bob", amountSompi: parseKasToSompi(String(i)) }, ctx);
    if (!r.ok) throw new Error(r.errors.join(", "));
    state = r.state;
    runs.push({ before, plan: r.planArtifact, receipt: r.receipt });
    // the dashboard lists a transaction from its receipt
    fs.writeFileSync(path.join(store, "receipts", `receipt-${i}.json`), JSON.stringify(r.receipt, null, 2));
  }
  const amountForged = (rc: any) => reseal({ ...rc, amountSompi: String(BigInt(rc.amountSompi) + 1n) });
  const writeReport = (name: string, report: any) => fs.writeFileSync(path.join(store, `${name}.replay.json`), JSON.stringify(report, null, 2));
  /** the receipt a report verified is the one in the store for that transaction (a report speaks for that receipt) */
  const storeReceipt = (i: number, receipt: any) =>
    fs.writeFileSync(path.join(store, "receipts", `receipt-${i}.json`), JSON.stringify(receipt, null, 2));

  // 1. a raw report, reproduced
  const raw = verifyReplay(runs[0]!.before, runs[0]!.plan, runs[0]!.receipt, ctx);
  writeReport("raw", raw);
  txIds.raw = raw.txId;
  // 2. a raw report, diverged: the stored receipt does not reproduce (its amount was changed and re-sealed)
  const divergingReceipt = amountForged(runs[1]!.receipt);
  storeReceipt(2, divergingReceipt);
  const diverged = verifyReplay(runs[1]!.before, runs[1]!.plan, divergingReceipt, ctx);
  writeReport("diverged", diverged);
  txIds.diverged = diverged.txId;
  // 3. a legacy report: decided before the raw comparison existed (no receiptComparison), sealed by its producer
  const legacy: any = { ...verifyReplay(runs[2]!.before, runs[2]!.plan, runs[2]!.receipt, ctx) };
  delete legacy.receiptComparison;
  writeReport("legacy", reseal(legacy));
  txIds.legacy = legacy.txId;
  // 4. a diverged report whose verdict was edited afterwards, not re-sealed: it does not verify
  const tamperedReceipt = amountForged(runs[3]!.receipt);
  storeReceipt(4, tamperedReceipt);
  const tampered: any = verifyReplay(runs[3]!.before, runs[3]!.plan, tamperedReceipt, ctx);
  writeReport("tampered", { ...tampered, receiptOk: true, invariantsOk: true, checks: { ...tampered.checks, workflowDeterministic: "reproduced" }, divergences: [], errors: [] });
  txIds.tampered = tampered.txId;

  const db = new HardkasStore({ dbPath: path.join(ws, ".hardkas", "store.db") });
  db.connect({ autoMigrate: true });
  try {
    await new HardkasIndexer(db.getDatabase(), { cwd: ws }).rebuild();
  } finally {
    db.disconnect();
  }
  previousRoot = process.env.HARDKAS_ROOT;
  process.env.HARDKAS_ROOT = ws;
});

afterAll(async () => {
  const { disconnectQueryBackend } = await import("../src/db.js");
  disconnectQueryBackend();
  if (previousRoot === undefined) delete process.env.HARDKAS_ROOT;
  else process.env.HARDKAS_ROOT = previousRoot;
  fs.rmSync(ws, { recursive: true, force: true });
});

const statusOf = async (txId: string) => {
  const { transactionsRoutes } = await import("../src/routes/transactions.js");
  const res = await transactionsRoutes.request("/");
  const body: any = await res.json();
  const tx = (body.transactions ?? []).find((t: any) => t.txId === txId);
  return { listed: !!tx, replayStatus: tx?.replayStatus };
};

describe("REPLAY-TRUST-2 · BEFORE · the dashboard's replay verdicts (D4)", () => {
  it("control: a raw, reproduced report → PASS", async () => {
    expect(await statusOf(txIds.raw)).toEqual({ listed: true, replayStatus: "PASS" });
  });

  it("control: a raw, diverged report → FAIL", async () => {
    expect(await statusOf(txIds.diverged)).toEqual({ listed: true, replayStatus: "FAIL" });
  });

  it("D4 · a legacy report (masked comparison) is not presented as a raw PASS", async () => {
    const s = await statusOf(txIds.legacy);
    expect(s.listed, "precondition: the transaction is listed").toBe(true);
    expect(s.replayStatus, "a verdict decided on a masked comparison is legacy (D4), not equivalent to a raw PASS").not.toBe("PASS");
  });

  it("a report that does not verify (its verdict edited, not re-sealed) does not make the transaction PASS", async () => {
    const s = await statusOf(txIds.tampered);
    expect(s.listed, "precondition: the transaction is listed").toBe(true);
    expect(s.replayStatus).not.toBe("PASS");
  });
});
