/*
 * WALLET-HD-0 · `security audit` recognises the extended private key formats of Kaspa (kprv, ktrv) and BIP32 (xprv and
 * the other *prv prefixes) wherever they sit, and ignores the public ones (kpub, ktub, xpub). Fictitious values with the
 * real shape (base58, 111 chars); the finding names the kind and the prefix, never the value. In-process: the exported
 * `findSecretMaterial`, no CLI process.
 */
import { describe, it, expect } from "vitest";
import { findSecretMaterial } from "../src/commands/security.js";

const BASE58_FILLER = "Zz9Aa8Bb7Cc6Dd5Ee4Ff3Gg2Hh1JjKkMmNnPpQqRrSsTtUuVvWwXxYy";
const fake = (prefix: string, total = 111) => (prefix + BASE58_FILLER.repeat(4)).slice(0, total);

describe("WALLET-HD-0 · findSecretMaterial", () => {
  it.each([["kprv"], ["ktrv"], ["xprv"], ["tprv"]])("finds a %s extended private key as a JSON field value", (prefix) => {
    const value = fake(prefix);
    const findings = findSecretMaterial(`{\n  "walletId": "w",\n  "masterKey": "${value}"\n}\n`);
    expect(findings.map((f) => f.kind)).toContain("extended private key");
    const f = findings.find((x) => x.kind === "extended private key")!;
    expect(f.where).toContain(prefix);
    expect(f.where).not.toContain(value.slice(4, 20));
  });

  it("finds it in an .env line and in a coloured log line", () => {
    const value = fake("kprv");
    expect(findSecretMaterial(`WALLET_XPRV=${value}\n`).map((f) => f.kind)).toContain("extended private key");
    expect(findSecretMaterial(`\x1b[37mimported ${value}\x1b[0m\n`).map((f) => f.kind)).toContain("extended private key");
  });

  it.each([["kpub"], ["ktub"], ["xpub"]])("does not flag a %s extended PUBLIC key", (prefix) => {
    expect(findSecretMaterial(`{"kpub": "${fake(prefix)}"}`)).toEqual([]);
  });

  it("a clean workspace file has no findings", () => {
    expect(findSecretMaterial('{"address": "kaspasim:qq", "network": "simnet", "label": "alice"}')).toEqual([]);
  });
});
