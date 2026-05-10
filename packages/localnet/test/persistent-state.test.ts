import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { 
  createInitialLocalnetState, 
  loadOrCreateLocalnetState, 
  fundAddress, 
  getAddressBalanceSompi,
  createLocalnetSnapshot,
  restoreLocalnetSnapshot,
  resolveAccountAddressFromState,
  resetLocalnetState,
  saveLocalnetState
} from "../src";

describe("Persistent Localnet State", () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-test-"));
    statePath = path.join(tmpDir, ".hardkas", "localnet.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should create initial state with genesis UTXOs", () => {
    const state = createInitialLocalnetState({ accounts: 3, initialBalanceSompi: 500n });
    expect(state.accounts).toHaveLength(3);
    expect(state.utxos).toHaveLength(3);
    expect(state.utxos[0]!.amountSompi).toBe("500");
    expect(state.daaScore).toBe("0");
  });

  it("should load or create state file", async () => {
    const state = await loadOrCreateLocalnetState({ cwd: tmpDir, accounts: 2 });
    expect(state.accounts).toHaveLength(2);
    
    const exists = await fs.access(statePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const loaded = await loadOrCreateLocalnetState({ cwd: tmpDir });
    expect(loaded.accounts).toHaveLength(2);
    expect(loaded.version).toBe(state.version);
  });

  it("should fund an address and increment DAA score", () => {
    let state = createInitialLocalnetState({ accounts: 1 });
    const address = state.accounts[0]!.address;
    
    state = fundAddress(state, { address, amountSompi: 100n });
    expect(state.daaScore).toBe("1");
    expect(state.utxos).toHaveLength(2);
    expect(state.utxos[1]!.address).toBe(address);
    expect(state.utxos[1]!.amountSompi).toBe("100");
    
    expect(getAddressBalanceSompi(state, address)).toBe(BigInt(state.utxos[0]!.amountSompi) + 100n);
  });

  it("should create and restore snapshots", () => {
    let state = createInitialLocalnetState({ accounts: 1 });
    const address = state.accounts[0]!.address;
    
    state = createLocalnetSnapshot(state, "original");
    
    state = fundAddress(state, { address, amountSompi: 100n });
    expect(getAddressBalanceSompi(state, address)).toBe(BigInt(state.utxos[0]!.amountSompi) + 100n);
    
    state = restoreLocalnetSnapshot(state, "original");
    expect(state.daaScore).toBe("0");
    expect(getAddressBalanceSompi(state, address)).toBe(BigInt(state.utxos[0]!.amountSompi));
  });

  it("should resolve account addresses", () => {
    const state = createInitialLocalnetState({ accounts: 2 });
    const aliceAddr = state.accounts[0]!.address;
    
    expect(resolveAccountAddressFromState(state, "alice")).toBe(aliceAddr);
    expect(resolveAccountAddressFromState(state, aliceAddr)).toBe(aliceAddr);
    expect(resolveAccountAddressFromState(state, "unknown")).toBe("unknown");
  });

  it("should reset state", async () => {
    await loadOrCreateLocalnetState({ cwd: tmpDir, accounts: 10 });
    const reset = await resetLocalnetState({ cwd: tmpDir, accounts: 2 });
    expect(reset.accounts).toHaveLength(2);
  });
});
