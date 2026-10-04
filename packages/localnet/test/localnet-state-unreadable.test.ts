import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storeEntryFor } from "@hardkas/artifacts";
import {
  buildStateSnapshotArtifact,
  calculateStateHash,
  createInitialLocalnetState,
  fundAddress,
  loadLocalnetState,
  loadOrCreateLocalnetState,
  saveLocalnetState,
  withSimulatorState
} from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// PAPERCUTS-1 · `loadLocalnetState` treated ANY read or parse failure of `localnet.json` (a BOM, a corrupt file, a
// directory, a permission error) as "the file does not exist": it returned null, or migrated `localnet-state.json` over
// it, and `loadOrCreateLocalnetState` then wrote a brand-new initial state over the user's ledger. Decided: only a
// missing file is absent; any other failure is refused and the bytes are left as they are. A BOM is not corruption: the
// state is read without it. The legacy migration goes through the state writer (SIMULATOR-STATE-EVIDENCE-1: its snapshot
// first) instead of a plain write.

const BOM = "﻿";
const SOMPI = 100_000_000n;

describe("localnet state · an unreadable state is never taken as absent", () => {
  let ws: string;
  const ledgerPath = () => path.join(ws, ".hardkas", "localnet.json");
  const legacyPath = () => path.join(ws, ".hardkas", "localnet-state.json");
  const snapshotFile = (state: any) => path.join(ws, ".hardkas", "artifacts", storeEntryFor(buildStateSnapshotArtifact(state, "x")).rel);
  /** a state that is not the default one, so an overwrite with a fresh state is visible */
  const fundedState = () => {
    const s = createInitialLocalnetState();
    return fundAddress(s, { address: s.accounts[0]!.address, amountSompi: 7n * SOMPI });
  };

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-state-unreadable-"));
    fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("a corrupt localnet.json: load and loadOrCreate fail closed, and its bytes are left as they are", async () => {
    fs.writeFileSync(ledgerPath(), "{ this is not json");
    const before = fs.readFileSync(ledgerPath());
    await expect(loadLocalnetState(ledgerPath())).rejects.toMatchObject({ code: "LOCALNET_STATE_UNREADABLE" });
    await expect(loadOrCreateLocalnetState({ cwd: ws })).rejects.toMatchObject({ code: "LOCALNET_STATE_UNREADABLE" });
    expect(fs.readFileSync(ledgerPath()).equals(before), "never overwritten").toBe(true);
  });

  it("a corrupt localnet.json is not replaced by a legacy localnet-state.json either", async () => {
    fs.writeFileSync(ledgerPath(), "{ this is not json");
    fs.writeFileSync(legacyPath(), JSON.stringify(fundedState()));
    const before = fs.readFileSync(ledgerPath());
    await expect(loadLocalnetState(ledgerPath())).rejects.toMatchObject({ code: "LOCALNET_STATE_UNREADABLE" });
    expect(fs.readFileSync(ledgerPath()).equals(before)).toBe(true);
  });

  it("a localnet.json that cannot be read (a directory) fails closed and is left as it is", async () => {
    fs.mkdirSync(ledgerPath());
    await expect(loadLocalnetState(ledgerPath())).rejects.toThrow();
    await expect(loadOrCreateLocalnetState({ cwd: ws })).rejects.toThrow();
    expect(fs.statSync(ledgerPath()).isDirectory()).toBe(true);
  });

  it("a localnet.json with a UTF-8 BOM is read as the state it holds, not replaced", async () => {
    const state = fundedState();
    fs.writeFileSync(ledgerPath(), BOM + JSON.stringify(state, null, 2));
    const before = fs.readFileSync(ledgerPath());
    const loaded = await loadOrCreateLocalnetState({ cwd: ws });
    expect(calculateStateHash(loaded)).toBe(calculateStateHash(state));
    expect(fs.readFileSync(ledgerPath()).equals(before), "not rewritten by a read").toBe(true);
  });

  it("a localnet.json with a BOM can still be changed: the recovery-first read accepts it too", async () => {
    const state = fundedState();
    fs.writeFileSync(ledgerPath(), BOM + JSON.stringify(state, null, 2));
    const next = fundAddress(state, { address: state.accounts[1]!.address, amountSompi: 3n * SOMPI });
    await withSimulatorState(ws, async () => saveLocalnetState(next, ledgerPath()));
    expect(calculateStateHash(JSON.parse(fs.readFileSync(ledgerPath(), "utf-8")))).toBe(calculateStateHash(next));
  });

  it("the legacy migration writes localnet.json through the state writer: the state's snapshot comes first", async () => {
    const legacy = fundedState();
    fs.writeFileSync(legacyPath(), JSON.stringify(legacy, null, 2));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaded = await loadLocalnetState(ledgerPath());
    expect(calculateStateHash(loaded!)).toBe(calculateStateHash(legacy));
    expect(fs.existsSync(ledgerPath())).toBe(true);
    expect(fs.existsSync(snapshotFile(legacy)), "the migrated state is evidenced").toBe(true);
    expect(fs.existsSync(legacyPath()), "the legacy file is kept").toBe(true);
  });

  it("a corrupt legacy file is refused and nothing is written", async () => {
    fs.writeFileSync(legacyPath(), "{ not json either");
    await expect(loadLocalnetState(ledgerPath())).rejects.toMatchObject({ code: "LOCALNET_STATE_UNREADABLE" });
    expect(fs.existsSync(ledgerPath())).toBe(false);
  });

  it("with neither file the state is absent and loadOrCreate creates it (control)", async () => {
    expect(await loadLocalnetState(ledgerPath())).toBeNull();
    const created = await loadOrCreateLocalnetState({ cwd: ws });
    expect(fs.existsSync(ledgerPath())).toBe(true);
    expect(calculateStateHash(created)).toBe(calculateStateHash(createInitialLocalnetState()));
  });
});
