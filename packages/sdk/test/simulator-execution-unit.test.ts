import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// SIMULATOR-EXECUTION-UNIT-1 (phase 2B of SNAPSHOT-CREATE-CONCURRENCY-1): two cooperative operations never interleave the
// read → modify → write of the same simulated state (`.hardkas/localnet.json`) nor its derived evidence (the state
// snapshot, the receipt and the trace). The unit holds the `simulator-state` lock; its writes take `artifacts` before the
// ledger moves, so a store held elsewhere delays the whole execution instead of splitting it.
// Measured before the fix (2026-10-03, cut23): with no lock on the ledger, a crash or a store held elsewhere between the
// ledger write and the receipt left money moved without a receipt (runs/midway2-1, runs/phantom-2).

const SOMPI = 100_000_000n;

describe("SIMULATOR-EXECUTION-UNIT-1 · a simulated execution is one unit", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sim-unit-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const ledgerPath = () => path.join(ws, ".hardkas", "localnet.json");
  const unspent = (name: string): bigint => {
    const state = JSON.parse(fs.readFileSync(ledgerPath(), "utf-8"));
    const address = state.accounts.find((a: any) => a.name === name).address;
    return state.utxos
      .filter((u: any) => u.address === address && !u.spent)
      .reduce((sum: bigint, u: any) => sum + BigInt(u.amountSompi), 0n);
  };
  const signedTransfer = async (from: string, to: string, amount: string) => {
    const plan = await sdk.tx.plan({ from: `kaspa:sim_${from}`, to: `kaspa:sim_${to}`, amount });
    await sdk.artifacts.write(plan);
    return sdk.tx.sign(plan, `kaspa:sim_${from}`, { persist: false });
  };
  /** A lock held by another live process (the test runner's parent), as a cooperative holder elsewhere would hold it. */
  const holdElsewhere = (name: string) => {
    const file = path.join(ws, ".hardkas", "locks", `${name}.lock`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ schema: "hardkas.lock.v1", name, pid: process.ppid, command: "another process (test)", cwd: ws, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }, null, 2)
    );
    return () => fs.rmSync(file, { force: true });
  };
  const settledWithin = async (p: Promise<unknown>, ms: number) => {
    let settled = false;
    p.then(() => (settled = true), () => (settled = true));
    await new Promise((r) => setTimeout(r, ms));
    return settled;
  };

  it("two simulated executions running at once in one process both land in the ledger", async () => {
    const toBob = await signedTransfer("alice", "bob", "5");
    const toDave = await signedTransfer("carol", "dave", "7");
    const bob0 = unspent("bob");
    const dave0 = unspent("dave");

    const [a, b] = await Promise.all([sdk.tx.simulate(toBob), sdk.tx.simulate(toDave)]);

    expect(fs.existsSync(a.receiptPath!)).toBe(true);
    expect(fs.existsSync(b.receiptPath!)).toBe(true);
    expect(unspent("bob") - bob0, "alice → bob 5 is in the ledger").toBe(5n * SOMPI);
    expect(unspent("dave") - dave0, "carol → dave 7 is in the ledger").toBe(7n * SOMPI);
  });

  it("waits for another holder of the simulated state before reading or moving the ledger", async () => {
    const toBob = await signedTransfer("alice", "bob", "5");
    const bob0 = unspent("bob");
    const before = fs.readFileSync(ledgerPath());
    const release = holdElsewhere("simulator-state");
    const run = sdk.tx.simulate(toBob);
    try {
      expect(await settledWithin(run, 1500), "still waiting while the state is held").toBe(false);
      expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is untouched while the state is held").toBe(true);
    } finally {
      release();
    }
    await run;
    expect(unspent("bob") - bob0).toBe(5n * SOMPI);
  });

  it("does not move the ledger while the execution's evidence cannot be written (the store held elsewhere)", async () => {
    const toBob = await signedTransfer("alice", "bob", "5");
    const bob0 = unspent("bob");
    const before = fs.readFileSync(ledgerPath());
    const release = holdElsewhere("artifacts");
    const run = sdk.tx.simulate(toBob);
    try {
      expect(await settledWithin(run, 1500), "still waiting while the store is held").toBe(false);
      expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is untouched while the store is held").toBe(true);
    } finally {
      release();
    }
    const { receiptPath, tracePath } = await run;
    expect(fs.existsSync(receiptPath!)).toBe(true);
    expect(fs.existsSync(tracePath!)).toBe(true);
    expect(unspent("bob") - bob0).toBe(5n * SOMPI);
  });
});
