import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAccountsFund } from "../src/runners/accounts-fund-runner.js";
import { runDagSimulateReorg } from "../src/runners/dag-runners.js";

vi.setConfig({ testTimeout: 60_000 });

// SIMULATOR-EXECUTION-UNIT-1 (phase 2B): the CLI's own read → modify → write of the simulated state (`simulator fund`,
// `dag simulate-reorg`) is one unit under `simulator-state`, like the simulated execution: it waits for another holder,
// and two of them at once never lose one's update. Both runners work on the current directory's workspace.

describe("SIMULATOR-EXECUTION-UNIT-1 · the CLI's writers of the simulated state", () => {
  const originalCwd = process.cwd();
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sim-writers-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default { defaultNetwork: 'simulated' };");
    process.chdir(ws);
  });

  afterEach(() => {
    process.chdir(originalCwd);
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

  it("simulator fund waits for another holder of the simulated state", async () => {
    await runAccountsFund({ identifier: "alice", amountSompi: 1n }); // the state exists from here on
    const before = fs.readFileSync(ledgerPath());
    const bob0 = unspent("bob");
    const release = holdElsewhere("simulator-state");
    const fund = runAccountsFund({ identifier: "bob", amountSompi: 3n });
    try {
      expect(await settledWithin(fund, 1500), "still waiting while the state is held").toBe(false);
      expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is untouched while the state is held").toBe(true);
    } finally {
      release();
    }
    await fund;
    expect(unspent("bob") - bob0).toBe(3n);
  });

  it("two fundings at once in one process both land in the ledger", async () => {
    await runAccountsFund({ identifier: "alice", amountSompi: 1n });
    const alice0 = unspent("alice");
    const bob0 = unspent("bob");
    await Promise.all([
      runAccountsFund({ identifier: "alice", amountSompi: 5n }),
      runAccountsFund({ identifier: "bob", amountSompi: 7n })
    ]);
    expect(unspent("alice") - alice0, "the funding of alice is in the ledger").toBe(5n);
    expect(unspent("bob") - bob0, "the funding of bob is in the ledger").toBe(7n);
  });

  it("dag simulate-reorg waits for another holder of the simulated state", async () => {
    await runAccountsFund({ identifier: "alice", amountSompi: 1n });
    const before = fs.readFileSync(ledgerPath());
    const release = holdElsewhere("simulator-state");
    const reorg = runDagSimulateReorg({ depth: 0 });
    try {
      expect(await settledWithin(reorg, 1500), "still waiting while the state is held").toBe(false);
      expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is untouched while the state is held").toBe(true);
    } finally {
      release();
    }
    await reorg;
    expect(JSON.parse(fs.readFileSync(ledgerPath(), "utf-8")).dag, "the reorg was written after the release").toBeDefined();
  });
});
