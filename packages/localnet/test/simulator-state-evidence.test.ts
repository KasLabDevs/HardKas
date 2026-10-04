import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storeEntryFor } from "@hardkas/artifacts";
import {
  buildStateSnapshotArtifact,
  calculateStateHash,
  forkFromNetwork,
  fundAddress,
  loadOrCreateLocalnetState,
  resetLocalnetState,
  saveLocalnetState,
  withSimulatorState
} from "../src/index.js";
import { withLock } from "@hardkas/core";

vi.setConfig({ testTimeout: 60_000 });

// SIMULATOR-STATE-EVIDENCE-1 (F2): for workspace-backed non-transaction simulator state (fund, DAG reorg, reset, fork,
// the first creation), the ledger state never becomes durable before its exact state snapshot artifact is durable;
// failing to publish the snapshot leaves the ledger unchanged and fails; an existing snapshot is never rewritten.
// An existing snapshot of the expected identity is adopted only when it is a valid state snapshot of exactly this state
// and its bytes are those this state's snapshot has with that file's own createdAt and hardkasVersion (the two fields
// outside its identity, whose authority is the durable artifact, not the process that meets it again, e.g. after a
// HardKAS version change); any other difference is a conflict.
// A state file elsewhere under a workspace's .hardkas (a scenario run's) follows the same rule with that workspace's
// store; a file outside every .hardkas (an export) gets no snapshot.
// Measured before the fix (2026-10-04, cut29 f2-matrix-1/-d-1): the ledger was written first and the snapshot after it,
// inside a catch-all, so fund, fork and the first create returned success with the ledger moved and no snapshot.
// Interruptions are reproduced with an IO error injected before one exact rename (every file lands by temp + rename).

const SOMPI = 100_000_000n;
const realRename = fs.renameSync;

describe("SIMULATOR-STATE-EVIDENCE-1 · a simulated state is evidenced before it is durable", () => {
  let ws: string;
  const scratch: string[] = [];

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-state-evidence-"));
    await loadOrCreateLocalnetState({ cwd: ws });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of [ws, ...scratch.splice(0)]) fs.rmSync(d, { recursive: true, force: true });
  });

  const ledgerPath = () => path.join(ws, ".hardkas", "localnet.json");
  const ledger = () => JSON.parse(fs.readFileSync(ledgerPath(), "utf-8"));
  const snapshotFile = (state: any) => path.join(ws, ".hardkas", "artifacts", storeEntryFor(buildStateSnapshotArtifact(state, "x")).rel);
  const funded = (state: any, name: string, kas: bigint) =>
    fundAddress(state, { address: state.accounts.find((a: any) => a.name === name).address, amountSompi: kas * SOMPI });
  /** What `simulator fund` does: one unit that reads, funds and saves the state. */
  const fund = (name: string, kas: bigint) => withSimulatorState(ws, async () => saveLocalnetState(funded(ledger(), name, kas), ledgerPath()));
  const failBeforeRename = (pattern: RegExp, nth = 1) => {
    let seen = 0;
    return vi.spyOn(fs, "renameSync").mockImplementation(((src: fs.PathLike, dst: fs.PathLike) => {
      if (pattern.test(String(dst)) && ++seen === nth) throw Object.assign(new Error(`EHKFAULT before rename of ${String(dst)}`), { code: "EHKFAULT" });
      return realRename.call(fs, src, dst);
    }) as typeof fs.renameSync);
  };
  const recordRenames = () => {
    const landed: string[] = [];
    vi.spyOn(fs, "renameSync").mockImplementation(((src: fs.PathLike, dst: fs.PathLike) => {
      landed.push(String(dst));
      return realRename.call(fs, src, dst);
    }) as typeof fs.renameSync);
    return landed;
  };
  const isSnapshot = (p: string) => /[\\/]misc[\\/]snapshot-[0-9a-f]{64}\.json$/.test(p);
  const isLedger = (p: string) => /[\\/]\.hardkas[\\/]localnet\.json$/.test(p);

  // ---- the F2 failures (they fail before the fix)

  it("a fund whose state snapshot cannot be written fails and leaves the ledger as it was", async () => {
    const before = fs.readFileSync(ledgerPath());
    const next = funded(ledger(), "alice", 5n);
    const fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(fund("alice", 5n)).rejects.toThrow();
    fault.mockRestore();
    expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is unchanged").toBe(true);
    expect(fs.existsSync(snapshotFile(next)), "no snapshot of a state that was not committed").toBe(false);
  });

  it("the first ledger of a workspace is not created when its state snapshot cannot be written", async () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "hk-state-evidence-fresh-"));
    scratch.push(fresh);
    const fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(loadOrCreateLocalnetState({ cwd: fresh })).rejects.toThrow();
    fault.mockRestore();
    expect(fs.existsSync(path.join(fresh, ".hardkas", "localnet.json")), "no ledger without its snapshot").toBe(false);
  });

  it("a fork into the workspace is not persisted when its state snapshot cannot be written", async () => {
    const before = fs.readFileSync(ledgerPath());
    const rpc: any = {
      getInfo: async () => ({ networkId: "simnet" }),
      getUtxosByAddress: async (address: string) => [{ outpoint: { transactionId: "a".repeat(64), index: 0 }, address, amountSompi: 7n * SOMPI, blockDaaScore: 100n }]
    };
    const forked = await forkFromNetwork(rpc, { network: "simnet", rpcUrl: "ws://injected", addresses: [ledger().accounts[0].address], atDaaScore: "100" });
    const fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(withLock({ rootDir: ws, name: "workspace", command: "hardkas localnet fork" }, () => saveLocalnetState(forked, ledgerPath()))).rejects.toThrow();
    fault.mockRestore();
    expect(fs.readFileSync(ledgerPath()).equals(before)).toBe(true);
  });

  // ---- the durable order, orphans, adoption

  it("the snapshot lands before the ledger", async () => {
    const landed = recordRenames();
    await fund("alice", 5n);
    const snapshotAt = landed.findIndex(isSnapshot);
    const ledgerAt = landed.findIndex(isLedger);
    expect(snapshotAt, "the snapshot was written").toBeGreaterThanOrEqual(0);
    expect(ledgerAt, "the ledger was written").toBeGreaterThanOrEqual(0);
    expect(snapshotAt, "snapshot first").toBeLessThan(ledgerAt);
  });

  it("a ledger write that fails after the snapshot landed leaves the snapshot (an orphan) and the ledger as it was", async () => {
    const before = fs.readFileSync(ledgerPath());
    const next = funded(ledger(), "alice", 5n);
    const fault = failBeforeRename(/[\\/]\.hardkas[\\/]localnet\.json$/);
    await expect(fund("alice", 5n)).rejects.toThrow();
    fault.mockRestore();
    expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is unchanged").toBe(true);
    expect(fs.existsSync(snapshotFile(next)), "the snapshot of the uncommitted state stays (orphan)").toBe(true);
  });

  it("a retry reaching the same state adopts the orphan without rewriting it", async () => {
    const next = funded(ledger(), "alice", 5n);
    const fault = failBeforeRename(/[\\/]\.hardkas[\\/]localnet\.json$/);
    await expect(fund("alice", 5n)).rejects.toThrow();
    fault.mockRestore();
    const orphan = fs.readFileSync(snapshotFile(next));
    const landed = recordRenames();
    await fund("alice", 5n);
    expect(landed.filter(isSnapshot), "the orphan is not rewritten").toEqual([]);
    expect(fs.readFileSync(snapshotFile(next)).equals(orphan)).toBe(true);
    expect(calculateStateHash(ledger())).toBe(calculateStateHash(next));
  });

  it("a reset never rewrites the initial state's snapshot", async () => {
    const initial = ledger();
    const initialSnapshot = fs.readFileSync(snapshotFile(initial));
    await fund("alice", 5n);
    const landed = recordRenames();
    await resetLocalnetState({ cwd: ws });
    expect(landed.filter(isSnapshot), "nothing is rewritten").toEqual([]);
    expect(landed.some(isLedger), "the ledger was written").toBe(true);
    expect(fs.readFileSync(snapshotFile(initial)).equals(initialSnapshot)).toBe(true);
  });

  it("a DAG reorg writes the ledger and no snapshot: the hashed state did not change, its snapshot is kept", async () => {
    const state = ledger();
    const snapshot = fs.readFileSync(snapshotFile(state));
    const landed = recordRenames();
    await withSimulatorState(ws, async () => saveLocalnetState({ ...ledger(), dag: { sink: "side", blocks: {}, selectedPathToSink: ["side"] } } as any, ledgerPath()));
    expect(landed.filter(isSnapshot)).toEqual([]);
    expect(landed.some(isLedger)).toBe(true);
    expect(fs.readFileSync(snapshotFile(state)).equals(snapshot)).toBe(true);
    expect(ledger().dag?.sink).toBe("side");
  });

  // ---- after a HardKAS version change: the existing snapshot keeps the version (and time) that first evidenced the state

  /** Rewrites a snapshot file as another HardKAS version would have written it: only its hardkasVersion differs. */
  const writtenByAnotherVersion = (file: string, version: string) => {
    const text = JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf-8")), hardkasVersion: version }, null, 2) + "\n";
    fs.writeFileSync(file, text);
    return text;
  };

  it("a reset after a HardKAS version change keeps the initial state's snapshot the older version wrote", async () => {
    const initial = ledger();
    await fund("alice", 5n);
    const planted = writtenByAnotherVersion(snapshotFile(initial), "0.0.0-older");
    const landed = recordRenames();
    await resetLocalnetState({ cwd: ws });
    expect(landed.filter(isSnapshot), "nothing is rewritten").toEqual([]);
    expect(fs.readFileSync(snapshotFile(initial), "utf-8"), "kept exactly as it was").toBe(planted);
    expect(calculateStateHash(ledger())).toBe(calculateStateHash(initial));
  });

  it("a deterministic state that recurs after a HardKAS version change adopts the snapshot the older version wrote", async () => {
    const recurring = funded(ledger(), "alice", 5n);
    await fund("alice", 5n);
    const planted = writtenByAnotherVersion(snapshotFile(recurring), "0.0.0-older");
    await resetLocalnetState({ cwd: ws });
    const landed = recordRenames();
    await fund("alice", 5n); // the same state again
    expect(landed.filter(isSnapshot), "nothing is rewritten").toEqual([]);
    expect(landed.some(isLedger), "the ledger was written").toBe(true);
    expect(fs.readFileSync(snapshotFile(recurring), "utf-8"), "kept exactly as it was").toBe(planted);
    expect(calculateStateHash(ledger())).toBe(calculateStateHash(recurring));
  });

  // ---- fail closed on anything else at the snapshot's path

  it.each([
    ["this state's snapshot serialized otherwise (same content, other bytes)", (exact: any) => JSON.stringify(exact)],
    // the builder writes no other field outside the identity: one added by hand is a difference like any other
    ["this state's snapshot with another field outside its identity (indexedAt)", (exact: any) => JSON.stringify({ ...exact, indexedAt: "2026-10-04T10:00:01.000Z" }, null, 2) + "\n"],
    ["this state's snapshot with a createdAt that is not a timestamp", (exact: any) => JSON.stringify({ ...exact, createdAt: "yesterday" }, null, 2) + "\n"],
    ["this state's snapshot with a hardkasVersion that is not a version string", (exact: any) => JSON.stringify({ ...exact, hardkasVersion: 7 }, null, 2) + "\n"],
    ["this state's snapshot with its authenticated content altered (declared identity kept)", (exact: any) => JSON.stringify({ ...exact, utxos: exact.utxos.map((u: any, i: number) => (i === 0 ? { ...u, amountSompi: "1" } : u)) }, null, 2) + "\n"],
    ["another state's valid snapshot", () => JSON.stringify(buildStateSnapshotArtifact(funded(ledger(), "alice", 6n), "2026-10-04T10:00:00.000Z"), null, 2) + "\n"],
    ["other content", () => JSON.stringify({ schema: "hardkas.snapshot.v1", contentHash: "0".repeat(64) }, null, 2) + "\n"]
  ])("a snapshot path holding %s refuses the change and touches nothing", async (_name, variant) => {
    const before = fs.readFileSync(ledgerPath());
    const next = funded(ledger(), "alice", 5n);
    const exact = buildStateSnapshotArtifact(next, "2026-10-04T10:00:00.000Z");
    fs.mkdirSync(path.dirname(snapshotFile(next)), { recursive: true });
    const planted = variant(exact);
    fs.writeFileSync(snapshotFile(next), planted);
    await expect(fund("alice", 5n)).rejects.toMatchObject({ code: "STATE_SNAPSHOT_CONFLICT" });
    expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is unchanged").toBe(true);
    expect(fs.readFileSync(snapshotFile(next), "utf-8"), "the file is left as it was").toBe(planted);
  });

  // ---- contention: nothing moves while another process holds the store

  it("waits for another holder of the store before writing anything, then lands snapshot and ledger", async () => {
    const lock = path.join(ws, ".hardkas", "locks", "artifacts.lock");
    fs.writeFileSync(lock, JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.ppid, command: "another process (test)", cwd: ws, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }, null, 2));
    const before = fs.readFileSync(ledgerPath());
    const next = funded(ledger(), "alice", 5n);
    let settled = false;
    const run = fund("alice", 5n).finally(() => (settled = true));
    await new Promise((r) => setTimeout(r, 1500));
    expect(settled, "still waiting").toBe(false);
    expect(fs.readFileSync(ledgerPath()).equals(before)).toBe(true);
    expect(fs.existsSync(snapshotFile(next))).toBe(false);
    fs.rmSync(lock);
    await run;
    expect(fs.existsSync(snapshotFile(next))).toBe(true);
    expect(calculateStateHash(ledger())).toBe(calculateStateHash(next));
  });

  // ---- a state file under the workspace's .hardkas that is not its own state file (a scenario run's)

  it("a state kept under the workspace's .hardkas (a scenario run's) is evidenced first, in that workspace's store", async () => {
    const runState = path.join(ws, ".hardkas", "runs", "r1", "localnet.json");
    const next = funded(ledger(), "alice", 5n);
    const fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(saveLocalnetState(next, runState)).rejects.toThrow();
    fault.mockRestore();
    expect(fs.existsSync(runState), "not written without its snapshot").toBe(false);
    const landed = recordRenames();
    await saveLocalnetState(next, runState);
    const snapshotAt = landed.findIndex(isSnapshot);
    const fileAt = landed.findIndex((p) => /[\\/]runs[\\/]r1[\\/]localnet\.json$/.test(p));
    expect(snapshotAt, "the snapshot was written").toBeGreaterThanOrEqual(0);
    expect(snapshotAt, "snapshot first").toBeLessThan(fileAt);
    expect(fs.existsSync(snapshotFile(next)), "in the workspace's store").toBe(true);
  });

  // ---- explicit external state files: no artifact-store snapshot, nothing created outside

  it("an explicit external state path gets no snapshot and creates nothing outside its own folder", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "hk-state-export-"));
    scratch.push(outside);
    const target = path.join(outside, "exports", "state.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // a guard, so a wrong implementation cannot create anything outside the test's folders while this runs
    const allowed = [path.resolve(outside), path.resolve(ws)].map((p) => p.toLowerCase());
    const attempts: string[] = [];
    const guard = (name: string) => {
      const real = (fs as any)[name];
      vi.spyOn(fs as any, name).mockImplementation(function (this: unknown, p: any, ...rest: unknown[]) {
        const abs = path.resolve(String(p)).toLowerCase();
        if (!allowed.some((a) => abs === a || abs.startsWith(a + path.sep))) {
          attempts.push(`${name} ${String(p)}`);
          throw Object.assign(new Error(`blocked ${name} outside the test folders: ${String(p)}`), { code: "EACCES" });
        }
        return real.call(this, p, ...rest);
      });
    };
    for (const name of ["mkdirSync", "openSync", "renameSync", "writeFileSync"]) guard(name);
    const pm = fs.promises.mkdir;
    vi.spyOn(fs.promises, "mkdir").mockImplementation((async (p: any, ...rest: any[]) => {
      const abs = path.resolve(String(p)).toLowerCase();
      if (!allowed.some((a) => abs === a || abs.startsWith(a + path.sep))) {
        attempts.push(`promises.mkdir ${String(p)}`);
        throw Object.assign(new Error(`blocked mkdir outside the test folders: ${String(p)}`), { code: "EACCES" });
      }
      return (pm as any).call(fs.promises, p, ...rest);
    }) as any);

    await saveLocalnetState(ledger(), target);
    vi.restoreAllMocks();
    expect(attempts, "no write was even attempted outside the test folders").toEqual([]);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.existsSync(path.join(outside, ".hardkas"))).toBe(false);
    expect(fs.existsSync(path.join(outside, "exports", ".hardkas"))).toBe(false);
  });
});
