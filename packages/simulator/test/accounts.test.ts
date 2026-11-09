import { describe, it, expect } from "vitest";
import {
  createDefaultDevAccounts,
  deriveAccountFromSeed,
  decodeKaspaAddress,
  p2pkScriptFromPublicKey
} from "../src/index.js";

describe("Dev Accounts & Key Derivation", () => {
  it("derives deterministic accounts with valid 32-byte Schnorr pubkeys and Bech32 addresses", () => {
    const accounts = createDefaultDevAccounts("simnet");

    expect(accounts.alice).toBeDefined();
    expect(accounts.bob).toBeDefined();
    expect(accounts.carol).toBeDefined();
    expect(accounts.dave).toBeDefined();
    expect(accounts.erin).toBeDefined();
    expect(accounts.miner).toBeDefined();

    // Check Alice
    expect(accounts.alice.address.startsWith("kaspasim:q")).toBe(true);
    expect(accounts.alice.publicKey.length).toBe(64);
    expect(accounts.alice.privateKey.length).toBe(64);
    expect(accounts.alice.scriptPublicKey).toBe(`20${accounts.alice.publicKey}ac`);

    // Verify address payload matches public key
    const decoded = decodeKaspaAddress(accounts.alice.address);
    expect(decoded).toBeDefined();
    const pubKeyHex = Array.from(decoded!.payload, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(pubKeyHex).toBe(accounts.alice.publicKey);
  });

  it("produces identical accounts across calls (pure determinism)", () => {
    const acc1 = deriveAccountFromSeed("alice", 0, "simnet");
    const acc2 = deriveAccountFromSeed("alice", 0, "simnet");

    expect(acc1.address).toBe(acc2.address);
    expect(acc1.privateKey).toBe(acc2.privateKey);
    expect(acc1.publicKey).toBe(acc2.publicKey);
  });

  it("generates correct P2PK script", () => {
    const pub = "11".repeat(32);
    const spk = p2pkScriptFromPublicKey(pub);
    expect(spk).toBe(`20${pub}ac`);
  });
});
