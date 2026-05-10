import { describe, it, expect } from "vitest";
import { 
  createInitialLocalnetState, 
  createLocalnetSnapshot,
  verifySnapshot,
  restoreLocalnetSnapshot,
  calculateStateHash,
  calculateUtxoSetHash,
  calculateAccountsHash
} from "../src/index.js";
import { parseKasToSompi } from "@hardkas/core";

describe("Snapshot Hashing", () => {
  it("should generate deterministic state hashes", () => {
    const createTest = () => {
      const state = createInitialLocalnetState({
        accounts: 2,
        initialBalanceSompi: parseKasToSompi("100")
      });
      return calculateStateHash(state);
    };

    expect(createTest()).toBe(createTest());
  });

  it("should remain deterministic regardless of UTXO order in state", () => {
    const state1 = createInitialLocalnetState({ accounts: 2 });
    const state2 = { ...state1, utxos: [...state1.utxos].reverse() };

    const hash1 = calculateUtxoSetHash(state1.utxos);
    const hash2 = calculateUtxoSetHash(state2.utxos);

    expect(hash1).toBe(hash2);
  });

  it("should change accountsHash on balance mutation", () => {
    const state = createInitialLocalnetState({ accounts: 2 });
    const hash1 = calculateAccountsHash(state.accounts);

    (state.accounts[0] as any).address = "something-else"; // Mutation
    const hash2 = calculateAccountsHash(state.accounts);

    expect(hash1).not.toBe(hash2);
  });

  it("should verify a valid snapshot", () => {
    const state = createInitialLocalnetState({ accounts: 2 });
    const stateWithSnapshot = createLocalnetSnapshot(state, "test");
    const snapshot = stateWithSnapshot.snapshots![0];

    const result = verifySnapshot(snapshot);
    expect(result.ok).toBe(true);
  });

  it("should detect tampering (contentHash mismatch)", () => {
    const state = createInitialLocalnetState({ accounts: 2 });
    const stateWithSnapshot = createLocalnetSnapshot(state, "test");
    const snapshot = JSON.parse(JSON.stringify(stateWithSnapshot.snapshots![0]));

    snapshot.daaScore = "99999"; // Tamper
    
    const result = verifySnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Content hash mismatch");
  });

  it("should detect deep tampering (stateHash mismatch)", () => {
    const state = createInitialLocalnetState({ accounts: 2 });
    const stateWithSnapshot = createLocalnetSnapshot(state, "test");
    const snapshot = JSON.parse(JSON.stringify(stateWithSnapshot.snapshots![0]));

    // Change a balance but keep the same contentHash (faking it)
    snapshot.accounts[0].name = "hacker";
    // If we re-calculate contentHash but don't re-calculate stateHash, verifySnapshotV2 should fail
    const { calculateContentHash } = require("@hardkas/artifacts");
    const temp = { ...snapshot };
    delete temp.contentHash;
    snapshot.contentHash = calculateContentHash(temp);

    const result = verifySnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes("Accounts hash mismatch") || e.includes("State hash mismatch"))).toBe(true);
  });

  it("should fail restoration of corrupted snapshot without mutating state", () => {
    let state = createInitialLocalnetState({ accounts: 1, initialBalanceSompi: 100n });
    state = createLocalnetSnapshot(state, "original");
    
    // Corrupt it
    state.snapshots![0]!.daaScore = "999";
    
    const preHash = calculateStateHash(state);
    
    expect(() => restoreLocalnetSnapshot(state, "original")).toThrow(/Corrupted snapshot/);
    
    expect(calculateStateHash(state)).toBe(preHash); // State unchanged
  });
});
