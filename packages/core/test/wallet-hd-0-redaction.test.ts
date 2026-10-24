/*
 * WALLET-HD-0 · redaction covers the extended private key formats Kaspa and BIP32 wallets use (kprv, ktrv, xprv and the
 * other *prv prefixes): free text (maskSecrets), structured fields (redactSecretFields / isSecretFieldName) and the
 * ANSI-wrapped form. Public extended keys (kpub, ktub, xpub) are NOT secrets and stay untouched. Every value below is a
 * FICTITIOUS string with the shape of the real format (base58 alphabet, 111 characters), never a real key.
 */
import { describe, it, expect } from "vitest";
import { maskSecrets, redactSecretFields, isSecretFieldName, EXTENDED_PRIVATE_KEY_PATTERN } from "../src/security.js";

const BASE58_FILLER = "Zz9Aa8Bb7Cc6Dd5Ee4Ff3Gg2Hh1JjKkMmNnPpQqRrSsTtUuVvWwXxYy"; // base58 alphabet only (no 0, O, I, l)
const fake = (prefix: string, total = 111) => (prefix + BASE58_FILLER.repeat(4)).slice(0, total);

const KPRV = fake("kprv");
const KTRV = fake("ktrv");
const XPRV = fake("xprv");
const ZPRV = fake("zprv");
const KPUB = fake("kpub");
const KTUB = fake("ktub");
const XPUB = fake("xpub");

describe("WALLET-HD-0 · maskSecrets (free text)", () => {
  it.each([["kprv", KPRV], ["ktrv", KTRV], ["xprv", XPRV], ["zprv", ZPRV]])("masks a %s extended private key", (_p, value) => {
    const out = maskSecrets(`Imported master key ${value} for account 0`);
    expect(out).not.toContain(value);
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("Imported master key");
  });

  it.each([["kpub", KPUB], ["ktub", KTUB], ["xpub", XPUB]])("leaves a %s extended PUBLIC key as it is", (_p, value) => {
    expect(maskSecrets(`watch-only from ${value}`)).toBe(`watch-only from ${value}`);
  });

  it("masks a key hidden inside colour escape sequences", () => {
    const coloured = `\x1b[37mkey=${KPRV}\x1b[0m`;
    const out = maskSecrets(coloured);
    expect(out).not.toContain(KPRV);
    expect(out).toContain("[REDACTED]");
  });

  it("masks secret-named fields of objects, extended keys included", () => {
    const out = maskSecrets({ name: "w", masterKprv: KPRV, xprv: XPRV, ktrv: KTRV, kpub: KPUB, nested: { accountXprv: XPRV } });
    expect(out.masterKprv).toBe("[REDACTED]");
    expect(out.xprv).toBe("[REDACTED]");
    expect(out.ktrv).toBe("[REDACTED]");
    expect(out.nested.accountXprv).toBe("[REDACTED]");
    expect(out.name).toBe("w");
    expect(out.kpub).toBe(KPUB);
  });

  it("the shared pattern matches only the private formats", () => {
    const re = new RegExp(EXTENDED_PRIVATE_KEY_PATTERN.source);
    expect(re.test(KPRV)).toBe(true);
    expect(re.test(KTRV)).toBe(true);
    expect(re.test(XPRV)).toBe(true);
    expect(re.test(KPUB)).toBe(false);
    expect(re.test(XPUB)).toBe(false);
    expect(re.test("kprv")).toBe(false); // the bare prefix is not a key
  });
});

describe("WALLET-HD-0 · structured redaction (evidence, listings, JSON)", () => {
  it("recognises the extended private key field names", () => {
    for (const name of ["xprv", "kprv", "ktrv", "XPrv", "extendedPrivateKey", "EXTENDED_PRIVATE_KEY", "masterXprv", "privKey"]) {
      expect(isSecretFieldName(name.toLowerCase().replace(/[_-]/g, "")) || redactSecretFields({ [name]: KPRV })[name] === "[REDACTED]", name).toBe(true);
    }
    expect(isSecretFieldName("kpub")).toBe(false);
    expect(isSecretFieldName("address")).toBe(false);
  });

  it("masks or drops them, keeps public material", () => {
    const value = { walletId: "w", kprv: KPRV, xprv: XPRV, extendedPrivateKey: KTRV, kpub: KPUB, address: "kaspasim:qq" };
    const masked = redactSecretFields(value, "mask");
    expect(masked.kprv).toBe("[REDACTED]");
    expect(masked.xprv).toBe("[REDACTED]");
    expect(masked.extendedPrivateKey).toBe("[REDACTED]");
    expect(masked.kpub).toBe(KPUB);
    expect(masked.address).toBe("kaspasim:qq");
    const dropped = redactSecretFields(value, "drop") as any;
    expect("kprv" in dropped).toBe(false);
    expect(JSON.stringify(dropped)).not.toContain(KPRV);
  });
});
