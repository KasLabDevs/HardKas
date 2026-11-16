/*
 * WALLET-HD-1 · L0 · BIP39 recovery phrases and Kaspa BIP32 derivation — pure, offline, the pinned kaspa-wasm 2.1.0
 * only (`Mnemonic`, `XPrv`, `XPub`, `PrivateKeyGenerator`, `PublicKeyGenerator`): HardKAS adds no cryptography of its own.
 *
 * Scheme (rusty-kaspa v2.1.0 wallet/keys gen1, `WalletDerivationManager`): purpose 44, coin type 111111, account
 * hardened, chain 0 = receive / 1 = change, index not hardened: `m/44'/111111'/<account>'/<chain>/<index>`. A wallet's
 * public identity is its ACCOUNT-level extended public key (`m/44'/111111'/<account>'`, what rusty-kaspa serialises as
 * the wallet's kpub), never the master one. Phrases: English, 12 or 24 words (rusty-kaspa `WordCount`; 15/18/21-word
 * BIP39 phrases are refused, as Kaspa wallets refuse them). The BIP39 passphrase is used exactly as given, as rusty-kaspa
 * does (`mnemonic{passphrase}` salt, no Unicode normalisation).
 *
 * Nothing here reads or writes a file, opens a connection or decides custody: mainnet derivation is allowed (the
 * official vectors are mainnet); every path that would SIGN or SEND on mainnet refuses it elsewhere. No function here
 * logs or puts secret material in an error message.
 */
import { HardkasError, isSimnetNetworkId, networkTypeOf } from "@hardkas/core";
import { loadKaspaWasmSync } from "./signer-backend.js";

export const KASPA_HD_PURPOSE = 44;
export const KASPA_HD_COIN_TYPE = 111111;
/** The phrase lengths kaspa-wasm 2.1.0 (rusty-kaspa `WordCount`) creates and accepts. */
export const HD_MNEMONIC_WORD_COUNTS = [12, 24] as const;
export type HdMnemonicWordCount = (typeof HD_MNEMONIC_WORD_COUNTS)[number];
export const HD_DEFAULT_MNEMONIC_WORDS: HdMnemonicWordCount = 24;
/** The largest non-hardened BIP32 child number (2^31 - 1): the bound of an account, receive or change index. */
export const HD_MAX_CHILD_INDEX = 0x7fffffff;

export type HdChain = "receive" | "change";
export type HdNetworkType = "mainnet" | "testnet" | "devnet" | "simnet";

const hdError = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, message, metadata ? { metadata } : undefined);

/**
 * The Kaspa network TYPE an HD wallet's addresses are encoded for: a rusty-kaspa network id (`simnet`, `testnet-10`,
 * `devnet`, `mainnet`, any `<type>-<n>`) or HardKAS's simnet aliases (`local-docker-simnet`). Any other name (a config
 * alias that was not resolved, `simulated`, an address prefix) is refused: HD_WALLET_NETWORK_UNKNOWN.
 */
export function hdNetworkTypeOf(network: string): HdNetworkType {
  const type = networkTypeOf(network);
  if (type) return type;
  if (isSimnetNetworkId(network) && String(network).trim().toLowerCase() !== "simulated") return "simnet";
  throw hdError(
    "HD_WALLET_NETWORK_UNKNOWN",
    `'${String(network)}' is not a Kaspa network id an HD wallet can be declared on (simnet, devnet, testnet-<n>; mainnet is locked down). ` +
      "The simulator ('simulated') has no HD wallets."
  );
}

/** The extended public key prefix HardKAS writes for a network type: `kpub` on mainnet, `ktub` on every other network. */
export function hdExtendedPublicKeyPrefix(type: HdNetworkType): "kpub" | "ktub" {
  return type === "mainnet" ? "kpub" : "ktub";
}

function assertIndex(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > HD_MAX_CHILD_INDEX) {
    throw hdError("HD_WALLET_INDEX_INVALID", `${what} ${String(value)} is not a BIP32 index (an integer from 0 to ${HD_MAX_CHILD_INDEX}).`);
  }
  return value;
}

/** `m/44'/111111'/<account>'[/<chain>/<index>]` (chain 0 receive, 1 change). */
export function hdDerivationPath(account: number, chain?: HdChain, index?: number): string {
  assertIndex(account, "account");
  const base = `m/${KASPA_HD_PURPOSE}'/${KASPA_HD_COIN_TYPE}'/${account}'`;
  if (chain === undefined) return base;
  return `${base}/${chain === "receive" ? 0 : 1}/${assertIndex(index ?? 0, "index")}`;
}

/** A phrase as kaspa-wasm reads it: words separated by single spaces, lower case, no surrounding whitespace. */
export function normalizeMnemonic(phrase: string): string {
  return String(phrase ?? "")
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Whether a phrase is a valid BIP39 English phrase of 12 or 24 words (wordlist and checksum), after normalisation. */
export function validateMnemonic(phrase: string): boolean {
  const normalized = normalizeMnemonic(phrase);
  const words = normalized === "" ? 0 : normalized.split(" ").length;
  if (!(HD_MNEMONIC_WORD_COUNTS as readonly number[]).includes(words)) return false;
  try {
    return loadKaspaWasmSync().Mnemonic.validate(normalized) === true;
  } catch {
    return false;
  }
}

/** The normalised phrase, or HD_WALLET_MNEMONIC_INVALID (the message names the word count only, never a word). */
export function assertValidMnemonic(phrase: string): string {
  const normalized = normalizeMnemonic(phrase);
  if (!validateMnemonic(normalized)) {
    const words = normalized === "" ? 0 : normalized.split(" ").length;
    throw hdError(
      "HD_WALLET_MNEMONIC_INVALID",
      `The recovery phrase is not a valid BIP39 English phrase of 12 or 24 words (${words} word(s) given; a word outside the ` +
        "English wordlist or a wrong checksum is refused too). Nothing was created or opened."
    );
  }
  return normalized;
}

/** A new random BIP39 English phrase (kaspa-wasm `Mnemonic.random`, the OS random source): 24 words by default. */
export function generateMnemonic(words: HdMnemonicWordCount = HD_DEFAULT_MNEMONIC_WORDS): string {
  if (!(HD_MNEMONIC_WORD_COUNTS as readonly number[]).includes(words)) {
    throw hdError("HD_WALLET_WORD_COUNT_UNSUPPORTED", `A recovery phrase has 12 or 24 words (kaspa-wasm 2.1.0); ${String(words)} was asked.`);
  }
  const m = loadKaspaWasmSync().Mnemonic.random(words);
  try {
    return String(m.phrase);
  } finally {
    m.free?.();
  }
}

/** The 64-byte BIP39 seed (hex) of a valid phrase and an optional passphrase (PBKDF2-HMAC-SHA512, 2048 rounds). */
export function mnemonicToSeedHex(phrase: string, passphrase = ""): string {
  const k = loadKaspaWasmSync();
  const m = new k.Mnemonic(assertValidMnemonic(phrase));
  try {
    return String(m.toSeed(passphrase));
  } finally {
    m.free?.();
  }
}

/**
 * An account-level extended public key, parsed and checked: depth 3 (`m/44'/111111'/<account>'`) with a hardened
 * child number. HD_WALLET_XPUB_INVALID otherwise (a master key, a chain or address key, or a string that is not one).
 * Returns the account index it was derived for.
 */
export function parseAccountXPub(xpub: string): { account: number; xpub: string } {
  const k = loadKaspaWasmSync();
  let parsed: any;
  try {
    parsed = new k.XPub(String(xpub ?? "").trim());
  } catch {
    throw hdError("HD_WALLET_XPUB_INVALID", "The extended public key does not parse (kpub/ktub/xpub base58 with a valid checksum expected).");
  }
  try {
    const depth = Number(parsed.depth);
    const child = Number(parsed.childNumber);
    if (depth !== 3 || child < 0x80000000) {
      throw hdError(
        "HD_WALLET_XPUB_INVALID",
        `The extended public key is not an ACCOUNT key (m/44'/111111'/<account>', depth 3, hardened): it has depth ${depth}. ` +
          "Export the account's kpub (what a Kaspa wallet shows as its extended public key), not the master key."
      );
    }
    return { account: child - 0x80000000, xpub: String(xpub).trim() };
  } finally {
    parsed.free?.();
  }
}

/** An account-level extended public key re-serialised with `network`'s prefix (kpub mainnet, ktub elsewhere). */
export function canonicalAccountXPub(xpub: string, network: string): string {
  const { xpub: checked } = parseAccountXPub(xpub);
  const k = loadKaspaWasmSync();
  const parsed = new k.XPub(checked);
  try {
    return String(parsed.intoString(hdExtendedPublicKeyPrefix(hdNetworkTypeOf(network))));
  } finally {
    parsed.free?.();
  }
}

/** Whether two extended public keys are the same key, whatever prefix each was serialised with. */
export function sameExtendedPublicKey(a: string, b: string): boolean {
  const k = loadKaspaWasmSync();
  let x: any;
  let y: any;
  try {
    x = new k.XPub(String(a ?? "").trim());
    y = new k.XPub(String(b ?? "").trim());
    return x.intoString("kpub") === y.intoString("kpub");
  } catch {
    return false;
  } finally {
    x?.free?.();
    y?.free?.();
  }
}

/** Addresses from an account-level extended public key: what a watch-only wallet can do. */
export class HdWatchKeyring {
  readonly account: number;
  private readonly xpub: string;

  constructor(accountXPub: string) {
    const { account, xpub } = parseAccountXPub(accountXPub);
    this.account = account;
    this.xpub = xpub;
  }

  /** The address of `chain`/`index` encoded for `network`. */
  address(chain: HdChain, index: number, network: string): string {
    return this.addresses(chain, index, 1, network)[0]!;
  }

  /** `count` consecutive addresses of `chain` from `start`. */
  addresses(chain: HdChain, start: number, count: number, network: string): string[] {
    assertIndex(start, "index");
    if (!Number.isSafeInteger(count) || count < 0) throw hdError("HD_WALLET_INDEX_INVALID", `count ${String(count)} is not a count.`);
    if (count === 0) return [];
    assertIndex(start + count - 1, "index");
    const type = hdNetworkTypeOf(network);
    const k = loadKaspaWasmSync();
    const gen = k.PublicKeyGenerator.fromXPub(this.xpub);
    try {
      const out: string[] = [];
      for (let i = start; i < start + count; i++) {
        out.push(String(chain === "receive" ? gen.receiveAddressAsString(type, i) : gen.changeAddressAsString(type, i)));
      }
      return out;
    } finally {
      gen.free?.();
    }
  }
}

/**
 * The keys of a wallet, in memory: built from a phrase (+ passphrase) or, for the official vectors, from a master
 * extended private key. Holds the master key until `dispose()`; nothing here persists or prints it.
 */
export class HdSigningKeyring {
  private masterKey: string;

  private constructor(masterKey: string) {
    this.masterKey = masterKey;
  }

  /** From a BIP39 phrase (validated, normalised) and an optional passphrase. */
  static fromMnemonic(phrase: string, passphrase = ""): HdSigningKeyring {
    const k = loadKaspaWasmSync();
    const seed = mnemonicToSeedHex(phrase, passphrase);
    const xprv = new k.XPrv(seed);
    try {
      return new HdSigningKeyring(String(xprv.intoString("kprv")));
    } finally {
      xprv.free?.();
    }
  }

  /** From a master extended private key (kprv/ktrv/xprv): the official derivation vectors start from one. */
  static fromMasterXPrv(masterXPrv: string): HdSigningKeyring {
    const k = loadKaspaWasmSync();
    let xprv: any;
    try {
      xprv = k.XPrv.fromXPrv(String(masterXPrv ?? "").trim());
    } catch {
      throw hdError("HD_WALLET_XPRV_INVALID", "The master extended private key does not parse.");
    }
    try {
      if (Number(xprv.depth) !== 0) throw hdError("HD_WALLET_XPRV_INVALID", "The extended private key is not a MASTER key (depth 0).");
      return new HdSigningKeyring(String(xprv.intoString("kprv")));
    } finally {
      xprv.free?.();
    }
  }

  private master(): string {
    if (!this.masterKey) throw hdError("HD_WALLET_KEYRING_DISPOSED", "This keyring was disposed; open the wallet again.");
    return this.masterKey;
  }

  /**
   * The master extended private key serialised with `prefix` (kprv mainnet, ktrv testnet): SECRET. Only the vector
   * tests read it; no HardKAS command prints or stores it.
   */
  masterExtendedPrivateKey(prefix: "kprv" | "ktrv" | "xprv"): string {
    const k = loadKaspaWasmSync();
    const xprv = k.XPrv.fromXPrv(this.master());
    try {
      return String(xprv.intoString(prefix));
    } finally {
      xprv.free?.();
    }
  }

  /** The account-level extended public key (`m/44'/111111'/<account>'`) with the network's prefix (or `prefix`). */
  accountXPub(account: number, network: string, prefix?: "kpub" | "ktub" | "xpub"): string {
    const k = loadKaspaWasmSync();
    const xprv = k.XPrv.fromXPrv(this.master());
    let child: any;
    let pub: any;
    try {
      child = xprv.derivePath(hdDerivationPath(account));
      pub = child.toXPub();
      return String(pub.intoString(prefix ?? hdExtendedPublicKeyPrefix(hdNetworkTypeOf(network))));
    } finally {
      pub?.free?.();
      child?.free?.();
      xprv.free?.();
    }
  }

  /** The watch-only view of one account (addresses only). */
  watch(account: number, network: string): HdWatchKeyring {
    return new HdWatchKeyring(this.accountXPub(account, network));
  }

  /** The address of `account`/`chain`/`index` on `network` (the same as the watch-only view's). */
  address(account: number, chain: HdChain, index: number, network: string): string {
    return this.watch(account, network).address(chain, index, network);
  }

  /** The 32-byte private key (hex) of `account`/`chain`/`index`: SECRET, for the signer only. */
  privateKeyHex(account: number, chain: HdChain, index: number): string {
    assertIndex(account, "account");
    assertIndex(index, "index");
    const k = loadKaspaWasmSync();
    const gen = new k.PrivateKeyGenerator(this.master(), false, BigInt(account));
    let key: any;
    try {
      key = chain === "receive" ? gen.receiveKey(index) : gen.changeKey(index);
      return String(key.toString());
    } finally {
      key?.free?.();
      gen.free?.();
    }
  }

  /** Drops the master key (best effort: JavaScript strings cannot be wiped). */
  dispose(): void {
    this.masterKey = "";
  }
}
