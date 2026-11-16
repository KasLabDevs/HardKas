/*
 * WALLET-HD-1 · the redaction covers what an HD wallet handles: BIP39 phrases under any phrase-bearing field name
 * (kaspa-wasm's Mnemonic.toJSON is `{ phrase, entropy }`), the BIP39 entropy, the passphrase, and the Kaspa spellings of
 * master/account extended private keys. Public material (kpub/ktub, wallet ids, flags) stays. Every value is FICTITIOUS.
 */
import { describe, it, expect } from "vitest";
import { maskSecrets, redactSecretFields, isSecretFieldName, isSecretUrlParamName } from "../src/security.js";

const BASE58 = "Zz9Aa8Bb7Cc6Dd5Ee4Ff3Gg2Hh1JjKkMmNnPpQqRrSsTtUuVvWwXxYy";
const fake = (prefix: string) => (prefix + BASE58.repeat(4)).slice(0, 111);
const PHRASE = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
const ENTROPY = "0f".repeat(16);
const KTUB = fake("ktub");

describe("WALLET-HD-1 · maskSecrets (objects)", () => {
  it("masks phrase, passphrase and entropy fields; keeps flags and public keys", () => {
    const out = maskSecrets({
      phrase: PHRASE,
      recoveryPhrase: PHRASE,
      passphrase: "my passphrase",
      entropy: ENTROPY,
      bip39Entropy: ENTROPY,
      passphraseRequired: true,
      xpub: KTUB,
      walletId: "ab".repeat(16)
    });
    for (const k of ["phrase", "recoveryPhrase", "passphrase", "entropy", "bip39Entropy"]) expect(out[k], k).toBe("[REDACTED]");
    expect(out.passphraseRequired).toBe(true);
    expect(out.xpub).toBe(KTUB);
    expect(out.walletId).toBe("ab".repeat(16));
  });
});

describe("WALLET-HD-1 · structured redaction", () => {
  it("the HD field names are secret names (any case, _ and - ignored)", () => {
    for (const name of ["masterKprv", "masterKtrv", "accountKprv", "accountKtrv", "recoveryPhrase", "mnemonic_phrase", "entropy", "bip39Entropy"]) {
      expect(redactSecretFields({ [name]: "x" })[name], name).toBe("[REDACTED]");
    }
    expect(isSecretFieldName("entropy")).toBe(true);
    expect(isSecretFieldName("recoveryphrase")).toBe(true);
    expect(isSecretUrlParamName("recovery_phrase")).toBe(true);
    expect(isSecretFieldName("xpub")).toBe(false);
    expect(isSecretFieldName("walletid")).toBe(false);
  });

  it("a wallet's public description passes unchanged; the material inside a kaspa-wasm Mnemonic dump does not", () => {
    const descriptor = {
      walletId: "cd".repeat(16),
      label: "main",
      network: "simnet",
      kind: "hd",
      accounts: [{ index: 0, xpub: KTUB, nextReceive: 2, nextChange: 1 }],
      passphraseRequired: false,
      mnemonicWords: 24,
      verified: true
    };
    expect(redactSecretFields(descriptor)).toEqual(descriptor);
    expect(redactSecretFields({ mnemonic: { phrase: PHRASE, entropy: ENTROPY } }, "drop")).toEqual({});
    const dumped = redactSecretFields({ dump: { phrase: PHRASE, entropy: ENTROPY } }).dump;
    expect(dumped).toEqual({ phrase: "[REDACTED]", entropy: "[REDACTED]" });
  });
});
