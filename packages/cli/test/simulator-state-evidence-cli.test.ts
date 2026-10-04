import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { buildStateSnapshotArtifact } from "@hardkas/localnet";
import { storeEntryFor } from "@hardkas/artifacts";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// SIMULATOR-STATE-EVIDENCE-1 through the built CLI, with real crashes: `simulator fund` is killed (SIGKILL, no cleanup)
// right before one exact rename by test/fixtures/crash-before-rename.cjs. The state snapshot must land before the ledger.
// Measured before the fix (2026-10-04, cut29 f2-matrix-1): the ledger landed first, so a kill between the two left the
// ledger funded with no snapshot.
// The funded state is not predicted here (the CLI funds the configured spelling of the account's address, which the
// faucet UTXO id is derived from): the snapshot that lands is found as the one new file of the store.

const CRASH_PRELOAD = path.join(__dirname, "fixtures", "crash-before-rename.cjs").replace(/\\/g, "/");

describe("SIMULATOR-STATE-EVIDENCE-1 · real crashes of simulator fund", () => {
  let ws: string;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-state-evidence-cli-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const cli = (args: string[], crashBeforeRename?: string) => {
    const env = childEnv(
      crashBeforeRename
        ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${CRASH_PRELOAD}`.trim(), HK_TEST_CRASH_BEFORE_RENAME: crashBeforeRename }
        : {}
    );
    return spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env, encoding: "utf8", timeout: 120_000 });
  };
  const ledgerPath = () => path.join(ws, ".hardkas", "localnet.json");
  const miscDir = () => path.join(ws, ".hardkas", "artifacts", "misc");
  const snapshots = () => new Set(fs.existsSync(miscDir()) ? fs.readdirSync(miscDir()).filter((f) => /^snapshot-[0-9a-f]{64}\.json$/.test(f)) : []);
  const added = (known: Set<string>) => [...snapshots()].filter((f) => !known.has(f));
  /** The file name of the state snapshot of what the ledger holds now. */
  const ledgerSnapshot = () => path.basename(storeEntryFor(buildStateSnapshotArtifact(JSON.parse(fs.readFileSync(ledgerPath(), "utf-8")), "x")).rel);

  it("killed after its snapshot landed and before its ledger: the ledger is unchanged, the snapshot stays, and fund again adopts it", async () => {
    expect(cli(["simulator", "fund", "alice", "--amount", "1"]).status, "the ledger exists").toBe(0);
    const before = fs.readFileSync(ledgerPath());
    const known = snapshots();
    const killed = cli(["simulator", "fund", "alice", "--amount", "5"], "[\\\\/]\\.hardkas[\\\\/]localnet\\.json$");
    expect(killed.status, "killed").not.toBe(0);
    expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger did not move").toBe(true);
    const orphans = added(known);
    expect(orphans, "the next state's snapshot landed first (an orphan now)").toHaveLength(1);
    const orphan = fs.readFileSync(path.join(miscDir(), orphans[0]!));

    const again = cli(["simulator", "fund", "alice", "--amount", "5"]);
    expect(again.status, again.stdout + again.stderr).toBe(0);
    expect(ledgerSnapshot(), "the state now in the ledger is the orphan's").toBe(orphans[0]);
    expect(added(known), "no other snapshot").toEqual(orphans);
    expect(fs.readFileSync(path.join(miscDir(), orphans[0]!)).equals(orphan), "adopted as it was, never rewritten").toBe(true);
  });

  it("killed before its snapshot landed: nothing changed, and fund again lands both", async () => {
    expect(cli(["simulator", "fund", "alice", "--amount", "1"]).status, "the ledger exists").toBe(0);
    const before = fs.readFileSync(ledgerPath());
    const known = snapshots();
    const killed = cli(["simulator", "fund", "alice", "--amount", "5"], "misc[\\\\/]snapshot-");
    expect(killed.status, "killed").not.toBe(0);
    expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger did not move").toBe(true);
    expect(added(known), "no snapshot landed").toEqual([]);

    expect(cli(["simulator", "fund", "alice", "--amount", "5"]).status).toBe(0);
    expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger moved").toBe(false);
    expect(added(known), "the funded state's snapshot landed with it").toEqual([ledgerSnapshot()]);
  });
});
