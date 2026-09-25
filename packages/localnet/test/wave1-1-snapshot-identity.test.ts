import { describe, it, expect } from "vitest";
import { CURRENT_HASH_VERSION, calculateContentHash, sortUtxosByOutpoint, verifyArtifactIntegritySync } from "@hardkas/artifacts";
import { createLocalnetSnapshot, verifySnapshot, calculateUtxoSetHash, calculateAccountsHash, calculateStateHash } from "../src/snapshot.js";

// Wave 1.1 · snapshot producers write hashVersion before hashing, add nothing after
// it, and keep their domain digests stable while the artifact hash version moves
// (the digest algorithm itself is IC-1′.7, Wave 1.3).

const state: any = {
  schema: "hardkas.localnetState.v1",
  hardkasVersion: "0.12.0-rc.23",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulator",
  daaScore: "42",
  accounts: [{ address: "kaspasim:qqbob", name: "bob" }, { address: "kaspasim:qqalice", name: "alice" }],
  utxos: [
    { id: `${"cd".repeat(32)}:1`, address: "kaspasim:qqbob", amountSompi: "5", spent: false, createdAtDaaScore: "1" },
    { id: `${"ab".repeat(32)}:0`, address: "kaspasim:qqalice", amountSompi: "7", spent: false, createdAtDaaScore: "1" }
  ],
  snapshots: []
};

describe("Wave 1.1 · localnet snapshot identity", () => {
  it("createLocalnetSnapshot produces a self-consistent current-version artifact", () => {
    const next = createLocalnetSnapshot(state, "s1");
    const snapshot: any = next.snapshots![0];
    expect(snapshot.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(calculateContentHash(snapshot, snapshot.hashVersion)).toBe(snapshot.contentHash);
    expect(verifySnapshot(snapshot).ok).toBe(true);
    const r = verifyArtifactIntegritySync(structuredClone(snapshot), { strict: false });
    expect(r.ok, r.issues.map((i) => `${i.code}:${i.message}`).join(" | ")).toBe(true);
    expect(r.authScope).toBe("FULL");
    // No identity copy outside the authenticated body.
    expect(snapshot.artifactId).toBeUndefined();
  });

  it("verifySnapshot recomputes with the declared version, so a v4 snapshot stays verifiable", () => {
    const next = createLocalnetSnapshot(state, "s1");
    const legacy: any = structuredClone(next.snapshots![0]);
    legacy.hashVersion = 4;
    legacy.contentHash = calculateContentHash(legacy, 4);
    expect(verifySnapshot(legacy).ok).toBe(true);
    const undeclared: any = { ...legacy, hashVersion: "x" };
    expect(verifySnapshot(undeclared).ok).toBe(false);
    expect(verifySnapshot(undeclared).errors.join(" ")).toMatch(/HASH_VERSION_INVALID/);
  });

  it("domain digests are pinned: their values do not depend on the artifact hash version", () => {
    expect(calculateUtxoSetHash(state.utxos)).toBe(calculateContentHash(sortUtxosByOutpoint(state.utxos), 4));
    expect(calculateAccountsHash(state.accounts)).toBe(calculateContentHash([...state.accounts].sort((a, b) => (a.address < b.address ? -1 : 1)), 4));
    expect(calculateStateHash(state)).toBe(calculateContentHash({ daaScore: state.daaScore, accountsHash: calculateAccountsHash(state.accounts), utxoSetHash: calculateUtxoSetHash(state.utxos) }, 4));
  });
});
