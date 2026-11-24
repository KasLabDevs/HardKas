import { describe, it, expect } from "vitest";
import { assertL2WriteAllowed, isMainnetNetwork, KNOWN_MAINNET_CHAIN_IDS } from "../src/network-guard.js";
import type { L2NetworkProfile } from "../src/profiles.js";

// AUDIT 2026-11-21 · A3 · the L2 write guard knew two mainnet chain IDs (1, 38833): a user network on any other
// value-bearing EVM chain came out `environment: "unknown"`, `writePolicy: "allowed"` and was signed for. Now the widely
// used EVM mainnets are in the list, and a network of undeclared environment is written to only on loopback.

const profile = (over: Partial<L2NetworkProfile>): L2NetworkProfile =>
  ({ name: "user-net", environment: "unknown", writePolicy: "allowed", chainId: 999_001, rpcUrl: "https://rpc.example.org", ...over }) as L2NetworkProfile;
const codeOf = (fn: () => void): string | undefined => {
  try { fn(); return undefined; } catch (e: any) { return String(e?.code); }
};

describe("A3 · L2 write guard: mainnet list and undeclared environments", () => {
  it("A3-1 the widely used EVM mainnets are mainnet whatever the profile declares", () => {
    for (const id of [1, 38833, 10, 56, 100, 137, 250, 324, 8453, 42161, 43114, 59144, 534352]) {
      expect(KNOWN_MAINNET_CHAIN_IDS.has(id), String(id)).toBe(true);
      expect(isMainnetNetwork(id, profile({ chainId: id, environment: "testnet" })), String(id)).toBe(true);
      expect(codeOf(() => assertL2WriteAllowed({ chainId: id, profile: profile({ chainId: id, environment: "testnet" }), operation: "sign" })), String(id)).toBe("L2_MAINNET_WRITE_BLOCKED");
    }
  });

  it("A3-2 an undeclared environment off loopback is refused, with the way out named", () => {
    let message = "";
    try { assertL2WriteAllowed({ chainId: 999_001, profile: profile({}), operation: "sign" }); } catch (e: any) { message = `${e.code}: ${e.message}`; }
    expect(message).toMatch(/^L2_ENVIRONMENT_UNDECLARED/);
    expect(message).toMatch(/environment: "testnet"/);
  });

  it("A3-3 the same network on loopback, or with its environment declared, is allowed", () => {
    expect(codeOf(() => assertL2WriteAllowed({ chainId: 999_001, profile: profile({ rpcUrl: "http://127.0.0.1:8545" }), operation: "sign" }))).toBeUndefined();
    expect(codeOf(() => assertL2WriteAllowed({ chainId: 999_001, profile: profile({ environment: "testnet" }), operation: "sign" }))).toBeUndefined();
    expect(codeOf(() => assertL2WriteAllowed({ chainId: 31337, profile: profile({ chainId: 31337, environment: "local", rpcUrl: "http://127.0.0.1:8545" }), operation: "sign" }))).toBeUndefined();
  });

  it("A3-4 a write with no profile keeps its chain-ID check only (the SDK always binds a profile before writing)", () => {
    expect(codeOf(() => assertL2WriteAllowed({ chainId: 137, operation: "sign" }))).toBe("L2_MAINNET_WRITE_BLOCKED");
    expect(codeOf(() => assertL2WriteAllowed({ chainId: 999_001, operation: "sign" }))).toBeUndefined();
  });
});
