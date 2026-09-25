import { describe, it, expect } from "vitest";
import { systemRuntimeContext, parseKasToSompi } from "@hardkas/core";
import * as artifacts from "@hardkas/artifacts";
import { calculateContentHash, CURRENT_HASH_VERSION, verifyArtifactIntegritySync } from "@hardkas/artifacts";
import { createLocalnetSnapshot, verifySnapshot, calculateUtxoSetHash, calculateAccountsHash, calculateStateHash } from "../src/snapshot.js";
import { createInitialLocalnetState, applySimulatedPayment, verifyReplay } from "../src/index.js";

// Wave 1.3 · Closure Pack IC-1′.7 / N7 (digest half, T-N7):
//   stateHash, utxoSetHash and accountsHash are DOMAIN digests computed by the
//   dedicated digest function (no exclusions, own algorithm version); the legacy
//   canonical-v4 digests are kept ONLY to verify and replay artifacts that
//   declare hashVersion ≤ 4. The algorithm is selected by the containing
//   artifact's declared hashVersion, never assumed.

const api = artifacts as any;
const ctx = systemRuntimeContext;

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

const sortedAccounts = () => [...state.accounts].sort((a: any, b: any) => (a.address < b.address ? -1 : 1));
const sortedUtxos = () => artifacts.sortUtxosByOutpoint(state.utxos);

// The two algorithms coincide on data without a name the artifact canonical form
// excludes (the plain localnet shape); they differ as soon as such a name appears,
// which is exactly the dependency IC-1′.7 removes. This state carries one.
const stateWithExcludedName: any = {
  ...state,
  accounts: state.accounts.map((a: any, i: number) => (i === 0 ? { ...a, status: "active" } : a))
};

describe("Wave 1.3 · localnet domain digests (IC-1′.7)", () => {
  it("current digests use domainDigest (no exclusions), not calculateContentHash", () => {
    expect(calculateUtxoSetHash(state.utxos)).toBe(api.domainDigest(sortedUtxos()));
    expect(calculateAccountsHash(state.accounts)).toBe(api.domainDigest(sortedAccounts()));
    expect(calculateStateHash(state)).toBe(
      api.domainDigest({ daaScore: state.daaScore, accountsHash: calculateAccountsHash(state.accounts), utxoSetHash: calculateUtxoSetHash(state.utxos) })
    );
    // An excluded name in the data changes the domain digest but not the v4 canonical form.
    const accountsWithStatus = [...stateWithExcludedName.accounts].sort((a: any, b: any) => (a.address < b.address ? -1 : 1));
    expect(calculateAccountsHash(stateWithExcludedName.accounts)).not.toBe(calculateAccountsHash(state.accounts));
    expect(calculateContentHash(accountsWithStatus, 4)).toBe(calculateContentHash(sortedAccounts(), 4));
    expect(calculateAccountsHash(stateWithExcludedName.accounts)).not.toBe(calculateContentHash(accountsWithStatus, 4));
  });

  it("the legacy algorithm is reachable only by explicit hashVersion ≤ 4 and equals the frozen canonical-v4 digest", () => {
    expect(calculateUtxoSetHash(state.utxos, { hashVersion: 4 })).toBe(calculateContentHash(sortedUtxos(), 4));
    expect(calculateAccountsHash(state.accounts, { hashVersion: 4 })).toBe(calculateContentHash(sortedAccounts(), 4));
    expect(calculateStateHash(state, { hashVersion: 4 })).toBe(
      calculateContentHash(
        { daaScore: state.daaScore, accountsHash: calculateContentHash(sortedAccounts(), 4), utxoSetHash: calculateContentHash(sortedUtxos(), 4) },
        4
      )
    );
    expect(calculateStateHash(state, { hashVersion: CURRENT_HASH_VERSION })).toBe(calculateStateHash(state));
  });

  it("a v5 snapshot carries current digests and verifies; its identity is FULL", () => {
    const next = createLocalnetSnapshot(state, "s1");
    const snapshot: any = next.snapshots![0];
    expect(snapshot.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(snapshot.stateHash).toBe(calculateStateHash(state));
    expect(snapshot.utxoSetHash).toBe(api.domainDigest(sortedUtxos()));
    expect(verifySnapshot(snapshot).ok).toBe(true);
    expect(verifyArtifactIntegritySync(structuredClone(snapshot), { strict: true }).ok).toBe(true);
  });

  it("a legacy v4 snapshot (digests computed with canonical v4) still verifies: the algorithm follows the declared version", () => {
    const legacy: any = {
      schema: "hardkas.snapshot.v1",
      createdAt: "2026-09-01T00:00:00.000Z",
      hardkasVersion: "0.12.0-rc.22",
      version: "1.0.0-alpha",
      hashVersion: 4,
      name: "legacy",
      daaScore: state.daaScore,
      accountsHash: calculateContentHash(sortedAccounts(), 4),
      utxoSetHash: calculateContentHash(sortedUtxos(), 4),
      accounts: structuredClone(state.accounts),
      utxos: structuredClone(sortedUtxos()),
      networkId: "simnet",
      mode: "simulator"
    };
    legacy.stateHash = calculateContentHash({ daaScore: legacy.daaScore, accountsHash: legacy.accountsHash, utxoSetHash: legacy.utxoSetHash }, 4);
    legacy.contentHash = calculateContentHash(legacy, 4);
    const r = verifySnapshot(legacy);
    expect(r.ok, r.errors.join(" | ")).toBe(true);
    expect(r.hashes.stateMatch).toBe(true);
  });

  it("a v5 snapshot that carries legacy digests does NOT verify (no silent fallback between algorithms)", () => {
    const next = createLocalnetSnapshot(stateWithExcludedName, "s1");
    const wrong: any = structuredClone(next.snapshots![0]);
    const legacyAccounts = [...stateWithExcludedName.accounts].sort((a: any, b: any) => (a.address < b.address ? -1 : 1));
    wrong.accountsHash = calculateContentHash(legacyAccounts, 4);
    wrong.utxoSetHash = calculateContentHash(sortedUtxos(), 4);
    wrong.stateHash = calculateContentHash({ daaScore: wrong.daaScore, accountsHash: wrong.accountsHash, utxoSetHash: wrong.utxoSetHash }, 4);
    wrong.contentHash = calculateContentHash(wrong, CURRENT_HASH_VERSION);
    expect(wrong.accountsHash).not.toBe(next.snapshots![0]!.accountsHash);
    const r = verifySnapshot(wrong);
    expect(r.ok).toBe(false);
    expect(r.hashes.accountsMatch).toBe(false);
    expect(r.hashes.stateMatch).toBe(false);
    expect(r.hashes.contentMatch).toBe(true);
  });
});

describe("Wave 1.3 · T-N7 replay uses the digest of the receipt's declared version", () => {
  function execute() {
    const initial: any = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("100") });
    // A name the artifact canonical form excludes, so the legacy and current state
    // digests of this state differ (see the note at the top of the file).
    initial.accounts[0] = { ...initial.accounts[0], status: "active" };
    const result = applySimulatedPayment(initial, { from: "alice", to: "bob", amountSompi: parseKasToSompi("10") }, ctx);
    if (!result.ok) throw new Error(result.errors.join(", "));
    expect(calculateStateHash(initial, { hashVersion: 4 })).not.toBe(calculateStateHash(initial));
    return { initial, result };
  }

  it("a current (v5) receipt records current digests and replays cleanly", () => {
    const { initial, result } = execute();
    expect((result.receipt as any).hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(result.receipt.preStateHash).toBe(calculateStateHash(initial));
    expect(result.receipt.postStateHash).toBe(calculateStateHash(result.state));
    const report = verifyReplay(initial, result.planArtifact!, result.receipt, ctx);
    expect(report.invariantsOk, report.errors.join(" | ")).toBe(true);
  });

  it("a legacy v4 receipt (digests from canonical v4) replays with the legacy digest: no false preStateHash divergence", () => {
    const { initial, result } = execute();
    const legacy: any = structuredClone(result.receipt);
    legacy.hashVersion = 4;
    legacy.preStateHash = calculateStateHash(initial, { hashVersion: 4 });
    legacy.postStateHash = calculateStateHash(result.state, { hashVersion: 4 });
    delete legacy.contentHash;
    legacy.contentHash = calculateContentHash(legacy, 4);
    legacy.lineage.artifactId = legacy.contentHash;
    const report = verifyReplay(initial, result.planArtifact!, legacy, ctx);
    expect(report.divergences.filter((d: any) => d.path === "preStateHash" && d.severity !== "warning")).toEqual([]);
    expect(report.divergences.filter((d: any) => d.path === "receipt.postStateHash")).toEqual([]);
    expect(report.invariantsOk, report.errors.join(" | ")).toBe(true);
  });

  it("control: a v5 receipt carrying legacy digests diverges (the declared version decides, nothing is retried)", () => {
    const { initial, result } = execute();
    const wrong: any = structuredClone(result.receipt);
    wrong.preStateHash = calculateStateHash(initial, { hashVersion: 4 });
    wrong.contentHash = calculateContentHash(wrong, CURRENT_HASH_VERSION);
    wrong.lineage.artifactId = wrong.contentHash;
    const report = verifyReplay(initial, result.planArtifact!, wrong, ctx);
    expect(report.invariantsOk).toBe(false);
    expect(report.errors.some((e) => e.includes("preStateHash mismatch"))).toBe(true);
  });
});
