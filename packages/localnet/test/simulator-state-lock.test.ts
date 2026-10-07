import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInitialLocalnetState, fundAddress, loadOrCreateLocalnetState, saveLocalnetState } from "../src";

vi.setConfig({ testTimeout: 30_000 });

// SIMULATOR-EXECUTION-UNIT-1 (phase 2B): every write of a workspace's simulated state (`<ws>/.hardkas/localnet.json`),
// not only the simulated execution, takes the `simulator-state` lock, so no writer lands inside another operation's
// read → modify → write. Creating the state on first use re-checks under the lock and never replaces a state that
// another writer created meanwhile.

describe("SIMULATOR-EXECUTION-UNIT-1 · writers of the simulated state", () => {
  let ws: string;
  let statePath: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sim-state-lock-"));
    statePath = path.join(ws, ".hardkas", "localnet.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

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

  it("saving the workspace's simulated state waits for another holder of it", async () => {
    const state = createInitialLocalnetState();
    const release = holdElsewhere("simulator-state");
    const save = saveLocalnetState(state, statePath);
    try {
      expect(await settledWithin(save, 1500), "still waiting while the state is held").toBe(false);
      expect(fs.existsSync(statePath), "nothing written while the state is held").toBe(false);
    } finally {
      release();
    }
    await save;
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8")).accounts).toHaveLength(5);
  });

  it("creating the state on first use waits, and keeps a state another writer created meanwhile", async () => {
    const release = holdElsewhere("simulator-state");
    const load = loadOrCreateLocalnetState({ cwd: ws });
    // the holder creates the state while the first use waits (a funded state, so it is distinguishable)
    const created = createInitialLocalnetState();
    const funded = fundAddress(created, { address: created.accounts[0]!.address, amountSompi: 7n });
    try {
      expect(await settledWithin(load, 1500), "still waiting while the state is held").toBe(false);
      fs.writeFileSync(statePath, JSON.stringify(funded, null, 2));
    } finally {
      release();
    }
    const state = await load;
    expect(state.utxos.length, "the state the holder created is the one returned").toBe(funded.utxos.length);
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8")).utxos.length, "and it was not replaced").toBe(funded.utxos.length);
  });
});
