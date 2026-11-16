/*
 * WALLET-HD-1 · L0 · derivation conformance against the official vectors (fixture wallet-hd-1/vectors.json):
 *   - rusty-kaspa v2.1.0 wallet/keys/src/derivation/gen1/hd.rs test module (master kprv → receive/change 0..19 mainnet,
 *     receive 0..19 testnet; mnemonic → master kprv and ACCOUNT-level kpub; mnemonic → master ktrv, account ktub and
 *     testnet receive[1]);
 *   - the BIP39 English vectors of trezor/python-mnemonic (passphrase "TREZOR"): seed, entropy and BIP32 root xprv, the
 *     seed also re-derived with node:crypto PBKDF2 (independent of kaspa-wasm).
 * Hermetic: the pinned kaspa-wasm in HARDKAS_HOME; public test vectors only, no secret of anyone's, nothing printed.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  HdSigningKeyring,
  HdWatchKeyring,
  assertValidMnemonic,
  generateMnemonic,
  hdDerivationPath,
  hdNetworkTypeOf,
  mnemonicToSeedHex,
  normalizeMnemonic,
  parseAccountXPub,
  validateMnemonic,
  HD_MAX_CHILD_INDEX
} from "../src/hd-derivation.js";
import { loadKaspaWasmSync } from "../src/signer-backend.js";

const FIXTURE = path.join(__dirname, "fixtures", "wallet-hd-1", "vectors.json");
/** sha256 of the fixture (LF line endings): an edited vector fails here before it is compared with anything. */
const FIXTURE_SHA256 = "fca2fff10cc5d8b214679a6830266ccc7939b9ebbd30c42f3708c6663557b13b";
const raw = fs.readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n");
const V = JSON.parse(raw);
const G = V.rustyKaspaGen1;

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return String(e?.code ?? "UNCODED");
  }
};

describe("WALLET-HD-1 · the vector fixture is the one recorded", () => {
  it("fixture hash and upstream source identity", () => {
    expect(crypto.createHash("sha256").update(raw).digest("hex")).toBe(FIXTURE_SHA256);
    expect(G.source).toMatchObject({
      tag: "v2.1.0",
      commit: "01b532e8b553523216471682649693af92f0fd16",
      path: "wallet/keys/src/derivation/gen1/hd.rs",
      sha256: "71fa7d1793215533ba89ea09820e639fa41cbce55b3a631e4ae74fd8b2867a84"
    });
    expect(V.bip39.source).toMatchObject({ repository: "https://github.com/trezor/python-mnemonic", gitBlob: "d362a5d4eb1ba800a52aec30116915cd4576e1fd" });
    expect(V.bip39.english).toHaveLength(24);
    expect(G.hd_wallet_gen1.receiveMainnet.length).toBeGreaterThanOrEqual(20);
    expect(G.hd_wallet_gen1.changeMainnet).toHaveLength(20);
    expect(G.generate_kaspatest_addresses.receiveTestnet).toHaveLength(20);
  });
});

describe("WALLET-HD-1 · rusty-kaspa v2.1.0 gen1 vectors (hd.rs)", () => {
  const ring = HdSigningKeyring.fromMasterXPrv(G.hd_wallet_gen1.masterKprv);

  it("hd_wallet_gen1 / generate_addresses_by_range: receive and change 0..19 on mainnet", () => {
    const watch = ring.watch(0, "mainnet");
    expect(watch.addresses("receive", 0, 20, "mainnet")).toEqual(G.hd_wallet_gen1.receiveMainnet.slice(0, 20));
    expect(watch.addresses("change", 0, 20, "mainnet")).toEqual(G.hd_wallet_gen1.changeMainnet);
    for (const i of [0, 1, 2, 19]) {
      expect(ring.address(0, "receive", i, "mainnet")).toBe(G.hd_wallet_gen1.receiveMainnet[i]);
      expect(ring.address(0, "change", i, "mainnet")).toBe(G.hd_wallet_gen1.changeMainnet[i]);
    }
  });

  it("generate_kaspatest_addresses: receive 0..19 on testnet (same keys, testnet encoding)", () => {
    expect(ring.watch(0, "testnet-10").addresses("receive", 0, 20, "testnet-10")).toEqual(G.generate_kaspatest_addresses.receiveTestnet);
  });

  it("the master key round-trips; each derived private key controls the vector's address", () => {
    expect(ring.masterExtendedPrivateKey("kprv")).toBe(G.hd_wallet_gen1.masterKprv);
    const k = loadKaspaWasmSync();
    for (const i of [0, 1, 7]) {
      const r = new k.PrivateKey(ring.privateKeyHex(0, "receive", i));
      expect(r.toKeypair().toAddress("mainnet").toString()).toBe(G.hd_wallet_gen1.receiveMainnet[i]);
      const c = new k.PrivateKey(ring.privateKeyHex(0, "change", i));
      expect(c.toKeypair().toAddress("mainnet").toString()).toBe(G.hd_wallet_gen1.changeMainnet[i]);
    }
  });

  it("wallet_from_mnemonic: phrase → master kprv, and the ACCOUNT-level kpub (m/44'/111111'/0') is the vector's", () => {
    const v = G.wallet_from_mnemonic;
    const r = HdSigningKeyring.fromMnemonic(v.mnemonic, v.passphrase);
    expect(r.masterExtendedPrivateKey("kprv")).toBe(v.masterKprv);
    expect(r.accountXPub(0, "mainnet")).toBe(v.accountKpub);
    // the master key's own kpub is NOT the vector (rusty-kaspa's wallet kpub is the account key)
    const k = loadKaspaWasmSync();
    expect(k.XPrv.fromXPrv(v.masterKprv).toXPub().intoString("kpub")).not.toBe(v.accountKpub);
    expect(parseAccountXPub(v.accountKpub).account).toBe(0);
  });

  it("address_test_by_ktrv: phrase → master ktrv, account ktub, testnet receive[1]", () => {
    const v = G.address_test_by_ktrv;
    const r = HdSigningKeyring.fromMnemonic(v.mnemonic, v.passphrase);
    expect(r.masterExtendedPrivateKey("ktrv")).toBe(v.masterKtrv);
    expect(r.accountXPub(0, "testnet-10")).toBe(v.accountKtub);
    expect(new HdWatchKeyring(v.accountKtub).address("receive", 1, "testnet-10")).toBe(v.receiveTestnet1);
    expect(r.address(0, "receive", 1, "testnet-10")).toBe(v.receiveTestnet1);
  });

  it("the watch-only view (account kpub only) derives the same addresses as the keys, on every network", () => {
    const kpub = ring.accountXPub(0, "mainnet");
    const watch = new HdWatchKeyring(kpub);
    expect(watch.address("receive", 0, "mainnet")).toBe(G.hd_wallet_gen1.receiveMainnet[0]);
    for (const network of ["simnet", "devnet", "testnet-10"]) {
      expect(watch.address("receive", 3, network)).toBe(ring.address(0, "receive", 3, network));
      expect(watch.address("change", 3, network)).toBe(ring.address(0, "change", 3, network));
    }
    expect(watch.address("receive", 0, "simnet")).toMatch(/^kaspasim:/);
    expect(watch.address("receive", 0, "devnet")).toMatch(/^kaspadev:/);
    // the same key on every network: only the prefix and checksum differ
    const payload = (a: string) => a.split(":")[1]!.slice(0, -8);
    expect(payload(watch.address("receive", 0, "simnet"))).toBe(payload(G.hd_wallet_gen1.receiveMainnet[0]));
  });

  it("another account derives other keys (account 1 ≠ account 0)", () => {
    expect(ring.address(1, "receive", 0, "mainnet")).not.toBe(G.hd_wallet_gen1.receiveMainnet[0]);
    expect(parseAccountXPub(ring.accountXPub(1, "mainnet")).account).toBe(1);
  });
});

describe("WALLET-HD-1 · BIP39 official vectors (trezor/python-mnemonic, passphrase TREZOR)", () => {
  const k = loadKaspaWasmSync();
  const pass = V.bip39.passphrase as string;
  const entries: Array<[string, string, string, string]> = V.bip39.english;

  it.each(entries.map((e, i) => [i, e] as const))("vector %i", (_i, [entropy, mnemonic, seed, xprv]) => {
    // independent of kaspa-wasm: PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic" + passphrase
    expect(crypto.pbkdf2Sync(Buffer.from(mnemonic, "utf8"), Buffer.from(`mnemonic${pass}`, "utf8"), 2048, 64, "sha512").toString("hex")).toBe(seed);
    const words = mnemonic.split(" ").length;
    if (words === 12 || words === 24) {
      expect(validateMnemonic(mnemonic)).toBe(true);
      expect(mnemonicToSeedHex(mnemonic, pass)).toBe(seed);
      const m = new k.Mnemonic(mnemonic);
      expect(m.entropy).toBe(entropy);
      expect(new k.XPrv(seed).intoString("xprv")).toBe(xprv);
    } else {
      // kaspa-wasm 2.1.0 (rusty-kaspa WordCount) reads 12- and 24-word phrases only: HardKAS refuses the others, typed
      expect(validateMnemonic(mnemonic)).toBe(false);
      expect(codeOf(() => assertValidMnemonic(mnemonic))).toBe("HD_WALLET_MNEMONIC_INVALID");
      // the BIP32 root of the seed is still the vector's
      expect(new k.XPrv(seed).intoString("xprv")).toBe(xprv);
    }
  });
});

describe("WALLET-HD-1 · phrases", () => {
  const twelve = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

  it("normalisation: case and whitespace do not matter; the seed is the same", () => {
    const messy = `  ${twelve.toUpperCase().replace(/ /g, " \t ")}\n`;
    expect(normalizeMnemonic(messy)).toBe(twelve);
    expect(validateMnemonic(messy)).toBe(true);
    expect(mnemonicToSeedHex(messy, "TREZOR")).toBe(mnemonicToSeedHex(twelve, "TREZOR"));
  });

  it("an invalid phrase is refused, and the refusal names no word", () => {
    for (const bad of ["test", "", twelve.replace("about", "abandon"), twelve.replace("about", "notaword"), `${twelve} about`]) {
      expect(validateMnemonic(bad)).toBe(false);
      try {
        assertValidMnemonic(bad);
        throw new Error("expected a refusal");
      } catch (e: any) {
        expect(e.code).toBe("HD_WALLET_MNEMONIC_INVALID");
        expect(String(e.message)).not.toMatch(/abandon|notaword/);
      }
    }
  });

  it("the passphrase changes the wallet; an empty passphrase is the same as none", () => {
    const a = HdSigningKeyring.fromMnemonic(twelve);
    const b = HdSigningKeyring.fromMnemonic(twelve, "");
    const c = HdSigningKeyring.fromMnemonic(twelve, "TREZOR");
    expect(a.accountXPub(0, "simnet")).toBe(b.accountXPub(0, "simnet"));
    expect(c.accountXPub(0, "simnet")).not.toBe(a.accountXPub(0, "simnet"));
  });

  it("generateMnemonic: 24 words by default, 12 on request, valid, never twice the same; 18 refused", () => {
    const a = generateMnemonic();
    const b = generateMnemonic();
    expect(a.split(" ")).toHaveLength(24);
    expect(validateMnemonic(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(generateMnemonic(12).split(" ")).toHaveLength(12);
    expect(codeOf(() => generateMnemonic(18 as any))).toBe("HD_WALLET_WORD_COUNT_UNSUPPORTED");
  });
});

describe("WALLET-HD-1 · networks, paths, keys", () => {
  it("networks: rusty-kaspa ids and the simnet alias; the simulator, prefixes and unknown names refused", () => {
    expect(hdNetworkTypeOf("simnet")).toBe("simnet");
    expect(hdNetworkTypeOf("local-docker-simnet")).toBe("simnet");
    expect(hdNetworkTypeOf("testnet-10")).toBe("testnet");
    expect(hdNetworkTypeOf("devnet")).toBe("devnet");
    expect(hdNetworkTypeOf("mainnet")).toBe("mainnet"); // derivation only: every key path refuses mainnet elsewhere
    for (const bad of ["simulated", "kaspasim", "kaspatest", "foo", ""]) {
      expect(codeOf(() => hdNetworkTypeOf(bad)), bad).toBe("HD_WALLET_NETWORK_UNKNOWN");
    }
  });

  it("paths and index bounds", () => {
    expect(hdDerivationPath(0)).toBe("m/44'/111111'/0'");
    expect(hdDerivationPath(0, "receive", 5)).toBe("m/44'/111111'/0'/0/5");
    expect(hdDerivationPath(2, "change", 0)).toBe("m/44'/111111'/2'/1/0");
    const ring = HdSigningKeyring.fromMasterXPrv(G.hd_wallet_gen1.masterKprv);
    expect(ring.address(0, "receive", HD_MAX_CHILD_INDEX, "simnet")).toMatch(/^kaspasim:/);
    for (const bad of [HD_MAX_CHILD_INDEX + 1, -1, 1.5]) {
      expect(codeOf(() => ring.address(0, "receive", bad, "simnet"))).toBe("HD_WALLET_INDEX_INVALID");
      expect(codeOf(() => ring.privateKeyHex(0, "receive", bad))).toBe("HD_WALLET_INDEX_INVALID");
    }
  });

  it("extended keys: only an ACCOUNT kpub makes a watch-only view; a master key or garbage is refused", () => {
    const k = loadKaspaWasmSync();
    expect(codeOf(() => parseAccountXPub(k.XPrv.fromXPrv(G.hd_wallet_gen1.masterKprv).toXPub().intoString("kpub")))).toBe("HD_WALLET_XPUB_INVALID");
    expect(codeOf(() => parseAccountXPub("kpubnotakey"))).toBe("HD_WALLET_XPUB_INVALID");
    expect(codeOf(() => HdSigningKeyring.fromMasterXPrv("kprvnotakey"))).toBe("HD_WALLET_XPRV_INVALID");
    const ring = HdSigningKeyring.fromMasterXPrv(G.hd_wallet_gen1.masterKprv);
    ring.dispose();
    expect(codeOf(() => ring.privateKeyHex(0, "receive", 0))).toBe("HD_WALLET_KEYRING_DISPOSED");
  });
});
