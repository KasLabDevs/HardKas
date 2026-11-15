/*
 * WALLET-HD-1 · L1 · the encrypted HD wallet keystore, `hardkas.encryptedWalletKeystore.v1`: one JSON file per wallet,
 * `.hardkas/wallets/<walletId>.json`.
 *
 * - Payload: the BIP39 recovery phrase ONLY (UTF-8), encrypted with AES-256-GCM under a key derived by Argon2id from the
 *   wallet password — the KDF, cipher and bounds of the account keystore v2 (keystore.ts: 64 MiB / 3 passes / 1 lane by
 *   default, KEYSTORE_KDF_BOUNDS). The BIP39 passphrase is never stored; `passphraseRequired` says one is needed.
 * - Authenticated data (AAD): the canonical public header — wallet id, label, network, kind, derivation scheme, every
 *   account's extended public key, `passphraseRequired`, word count, creation time and origin — plus the type, version
 *   and KDF parameters. Editing any of them makes the file refuse to open, exactly like a wrong password.
 * - `state` (next receive / change index per account) is deliberately NOT authenticated: it changes without the password
 *   (every new receive address advances it). Editing it only changes which index is offered next; an address is always
 *   derived from the account key, which IS authenticated once the wallet is opened.
 * - A watch-only wallet (`kind: "watch-only"`) holds an account public key and no secret: no KDF, no cipher, no payload.
 *   Nothing in it can be authenticated (there is no key); readers report it as unverified.
 * The wallet id is random (16 bytes), never derived from the secret.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { argon2id } from "hash-wasm";
import { HardkasError, writeFileAtomic, stripBom } from "@hardkas/core";
import { keystoreKdfParamsProblem } from "./keystore.js";
import { KASPA_HD_COIN_TYPE, KASPA_HD_PURPOSE, type HdNetworkType } from "./hd-derivation.js";

export const HD_WALLET_KEYSTORE_TYPE = "hardkas.encryptedWalletKeystore.v1" as const;
export const HD_WALLET_KEYSTORE_VERSION = "1.0.0" as const;
/** The label that opens the AES-GCM additional data of every wallet keystore (domain separation). */
export const HD_WALLET_KEYSTORE_AAD = "hardkas-wallet-keystore-aad-v1" as const;
/** Where a workspace keeps its HD wallets. */
export const HD_WALLETS_DIR = path.join(".hardkas", "wallets");

/** Argon2id defaults: those of the account keystore v2 (64 MiB, 3 passes, 1 lane). */
export const HD_WALLET_KDF_DEFAULTS = Object.freeze({ memory: 65_536, iterations: 3, parallelism: 1 });

export type HdWalletKind = "hd" | "watch-only";
export type HdWalletOrigin = "generated" | "imported" | "watch-only-import";

export interface HdWalletAccountHeader {
  /** The BIP44 account index (hardened in the path). */
  readonly index: number;
  /** The account-level extended public key, `m/44'/111111'/<index>'` (kpub on mainnet, ktub elsewhere). */
  readonly xpub: string;
}

/** The public header: in clear, and (for an encrypted wallet) authenticated with the ciphertext. */
export interface HdWalletKeystoreHeader {
  readonly walletId: string;
  readonly label: string;
  /** The network id the wallet was declared on (as the workspace names it, resolved to the declared id). */
  readonly network: string;
  readonly networkType: HdNetworkType;
  readonly kind: HdWalletKind;
  readonly derivation: { readonly scheme: "kaspa-bip44"; readonly purpose: 44; readonly coinType: 111111 };
  readonly accounts: readonly HdWalletAccountHeader[];
  readonly passphraseRequired: boolean;
  /** 12 or 24 for an encrypted wallet; absent for a watch-only one. */
  readonly mnemonicWords?: 12 | 24;
  readonly createdAt: string;
  readonly origin: HdWalletOrigin;
}

/** The mutable, unauthenticated index tracking (see the module comment). */
export interface HdWalletKeystoreState {
  accounts: Record<string, { nextReceive: number; nextChange: number }>;
  updatedAt?: string;
}

export interface EncryptedHdWalletKeystoreV1 {
  type: typeof HD_WALLET_KEYSTORE_TYPE;
  version: typeof HD_WALLET_KEYSTORE_VERSION;
  header: HdWalletKeystoreHeader;
  /** Absent for a watch-only wallet. */
  kdf?: { algorithm: "argon2id"; memory: number; iterations: number; parallelism: number; salt: string };
  cipher?: { algorithm: "aes-256-gcm"; nonce: string; tag: string; aad: typeof HD_WALLET_KEYSTORE_AAD };
  /** base64 AES-256-GCM ciphertext of the recovery phrase. Absent for a watch-only wallet. */
  encryptedPayload?: string;
  state: HdWalletKeystoreState;
}

const err = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, message, metadata ? { metadata } : undefined);

const WALLET_ID = /^[0-9a-f]{32}$/;
const LABEL = /^[A-Za-z0-9_-]{1,64}$/;

/** A new wallet id: 16 random bytes (hex). Never derived from the phrase. */
export function newHdWalletId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function isHdWalletId(value: unknown): value is string {
  return typeof value === "string" && WALLET_ID.test(value);
}

/** HD_WALLET_LABEL_INVALID unless the label is 1–64 letters, digits, `_` or `-`. */
export function assertHdWalletLabel(label: unknown): string {
  if (typeof label !== "string" || !LABEL.test(label)) {
    throw err("HD_WALLET_LABEL_INVALID", `A wallet name is 1 to 64 letters, digits, '_' or '-' (got ${JSON.stringify(label)}).`);
  }
  return label;
}

/** KEYSTORE_PASSWORD_TOO_SHORT for an empty password or one under 8 characters (the account keystore's rule). */
export function assertHdWalletPassword(password: unknown, what = "The wallet password"): string {
  if (typeof password !== "string" || password.length < 8) {
    throw err("KEYSTORE_PASSWORD_TOO_SHORT", `${what} must be at least 8 characters long. Nothing was written.`);
  }
  return password;
}

/** The header in one fixed order: the bytes the AAD covers, independent of JSON key order. */
function canonicalHeader(h: HdWalletKeystoreHeader): unknown[] {
  return [
    h.walletId,
    h.label,
    h.network,
    h.networkType,
    h.kind,
    h.derivation?.scheme,
    h.derivation?.purpose,
    h.derivation?.coinType,
    (h.accounts ?? []).map((a) => [a.index, a.xpub]),
    h.passphraseRequired,
    h.mnemonicWords ?? null,
    h.createdAt,
    h.origin
  ];
}

/** The AES-GCM additional data of an encrypted wallet: type, version, KDF parameters and the canonical header. */
export function hdWalletKeystoreAad(file: Pick<EncryptedHdWalletKeystoreV1, "type" | "version" | "header" | "kdf">): Buffer {
  const kdf = file.kdf;
  return Buffer.from(
    JSON.stringify([
      HD_WALLET_KEYSTORE_AAD,
      file.type,
      file.version,
      kdf?.algorithm ?? null,
      kdf?.memory ?? null,
      kdf?.iterations ?? null,
      kdf?.parallelism ?? null,
      kdf?.salt ?? null,
      canonicalHeader(file.header)
    ]),
    "utf8"
  );
}

async function deriveKey(password: string, kdf: { memory: number; iterations: number; parallelism: number; salt: string }): Promise<Buffer> {
  const hex = await argon2id({
    password,
    salt: Buffer.from(kdf.salt, "base64"),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memory,
    hashLength: 32,
    outputType: "hex"
  });
  return Buffer.from(hex, "hex");
}

function initialState(header: HdWalletKeystoreHeader): HdWalletKeystoreState {
  const accounts: HdWalletKeystoreState["accounts"] = {};
  for (const a of header.accounts) accounts[String(a.index)] = { nextReceive: 0, nextChange: 0 };
  return { accounts };
}

/**
 * Encrypts `mnemonic` under `password` with `header` authenticated. The KDF parameters default to the account
 * keystore's and must respect its creation floor (KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS).
 */
export async function encryptHdWalletKeystore(input: {
  header: HdWalletKeystoreHeader;
  mnemonic: string;
  password: string;
  state?: HdWalletKeystoreState;
  kdf?: Partial<{ memory: number; iterations: number; parallelism: number }>;
}): Promise<EncryptedHdWalletKeystoreV1> {
  if (input.header.kind !== "hd") throw err("HD_WALLET_KEYSTORE_INVALID", "Only an HD wallet (kind 'hd') carries an encrypted phrase.");
  const password = assertHdWalletPassword(input.password);
  const params = { ...HD_WALLET_KDF_DEFAULTS, ...(input.kdf ?? {}) };
  const weak = keystoreKdfParamsProblem(params, true);
  if (weak) throw err("KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS", `Argon2id ${weak} is outside the accepted range (see KEYSTORE_KDF_BOUNDS). Nothing was written.`);
  const kdf = { algorithm: "argon2id" as const, ...params, salt: crypto.randomBytes(16).toString("base64") };
  const nonce = crypto.randomBytes(12);
  const draft = { type: HD_WALLET_KEYSTORE_TYPE, version: HD_WALLET_KEYSTORE_VERSION, header: input.header, kdf };
  const key = await deriveKey(password, kdf);
  let ciphertext: Buffer;
  let tag: Buffer;
  try {
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(hdWalletKeystoreAad(draft));
    ciphertext = Buffer.concat([cipher.update(input.mnemonic, "utf8"), cipher.final()]);
    tag = cipher.getAuthTag();
  } finally {
    key.fill(0);
  }
  return {
    ...draft,
    cipher: { algorithm: "aes-256-gcm", nonce: nonce.toString("base64"), tag: tag.toString("base64"), aad: HD_WALLET_KEYSTORE_AAD },
    encryptedPayload: ciphertext.toString("base64"),
    state: input.state ?? initialState(input.header)
  };
}

/** A watch-only wallet file (no secret, nothing authenticated). */
export function createWatchOnlyHdWalletKeystore(header: HdWalletKeystoreHeader, state?: HdWalletKeystoreState): EncryptedHdWalletKeystoreV1 {
  if (header.kind !== "watch-only") throw err("HD_WALLET_KEYSTORE_INVALID", "A watch-only wallet file has kind 'watch-only'.");
  return { type: HD_WALLET_KEYSTORE_TYPE, version: HD_WALLET_KEYSTORE_VERSION, header, state: state ?? initialState(header) };
}

/**
 * Decrypts the recovery phrase. KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS before any derivation when the file asks for KDF
 * parameters outside the bounds; HD_WALLET_UNLOCK_FAILED for a wrong password OR an edited header (AES-GCM cannot tell
 * which; the message says both); HD_WALLET_WATCH_ONLY for a watch-only wallet.
 */
export async function decryptHdWalletKeystore(file: EncryptedHdWalletKeystoreV1, password: string): Promise<string> {
  if (file.header?.kind === "watch-only") {
    throw err("HD_WALLET_WATCH_ONLY", `Wallet '${file.header.label}' is watch-only: it holds no recovery phrase and cannot sign.`);
  }
  const kdf = file.kdf;
  const problem = kdf ? keystoreKdfParamsProblem(kdf, false) : "no KDF parameters";
  if (problem || kdf?.algorithm !== "argon2id") {
    throw err(
      "KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS",
      `Argon2id ${problem ?? `algorithm ${String(kdf?.algorithm)}`} is outside the accepted range; the wallet was not opened.`
    );
  }
  const failed = () =>
    err(
      "HD_WALLET_UNLOCK_FAILED",
      `The wallet '${String(file.header?.label)}' does not open: a wrong password, or a file whose authenticated header (network, account keys, ` +
        "passphrase flag, KDF parameters…) was edited. Nothing was decrypted."
    );
  if (typeof password !== "string" || password === "") throw failed();
  const nonce = Buffer.from(String(file.cipher?.nonce ?? ""), "base64");
  const tag = Buffer.from(String(file.cipher?.tag ?? ""), "base64");
  if (file.cipher?.algorithm !== "aes-256-gcm" || nonce.length !== 12 || tag.length !== 16 || typeof file.encryptedPayload !== "string") throw failed();
  const key = await deriveKey(password, kdf!);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(hdWalletKeystoreAad(file));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(file.encryptedPayload, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw failed();
  } finally {
    key.fill(0);
  }
}

const isInt = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Structural validation of a parsed file (HD_WALLET_KEYSTORE_INVALID names what is wrong, never a value). */
export function parseHdWalletKeystore(value: unknown, where = "wallet file"): EncryptedHdWalletKeystoreV1 {
  const bad = (what: string) => err("HD_WALLET_KEYSTORE_INVALID", `The ${where} is not a valid ${HD_WALLET_KEYSTORE_TYPE}: ${what}.`);
  const f = value as EncryptedHdWalletKeystoreV1;
  if (!f || typeof f !== "object") throw bad("not a JSON object");
  if (f.type !== HD_WALLET_KEYSTORE_TYPE) throw bad(`type ${JSON.stringify((f as any).type)}`);
  if (f.version !== HD_WALLET_KEYSTORE_VERSION) throw bad(`unsupported version ${JSON.stringify((f as any).version)}`);
  const h = f.header as HdWalletKeystoreHeader;
  if (!h || typeof h !== "object") throw bad("no header");
  if (!isHdWalletId(h.walletId)) throw bad("walletId");
  if (typeof h.label !== "string" || !LABEL.test(h.label)) throw bad("label");
  if (typeof h.network !== "string" || h.network.trim() === "") throw bad("network");
  if (!["mainnet", "testnet", "devnet", "simnet"].includes(h.networkType)) throw bad("networkType");
  if (h.kind !== "hd" && h.kind !== "watch-only") throw bad("kind");
  if (h.derivation?.scheme !== "kaspa-bip44" || h.derivation?.purpose !== KASPA_HD_PURPOSE || h.derivation?.coinType !== KASPA_HD_COIN_TYPE) throw bad("derivation");
  if (!Array.isArray(h.accounts) || h.accounts.length === 0) throw bad("accounts");
  const seen = new Set<number>();
  for (const a of h.accounts) {
    if (!isInt(a?.index) || seen.has(a.index) || typeof a?.xpub !== "string" || a.xpub === "") throw bad("an account entry");
    seen.add(a.index);
  }
  if (typeof h.passphraseRequired !== "boolean") throw bad("passphraseRequired");
  if (typeof h.createdAt !== "string") throw bad("createdAt");
  if (!["generated", "imported", "watch-only-import"].includes(h.origin)) throw bad("origin");
  if (h.kind === "hd") {
    if (h.mnemonicWords !== 12 && h.mnemonicWords !== 24) throw bad("mnemonicWords");
    if (!f.kdf || !f.cipher || typeof f.encryptedPayload !== "string") throw bad("an HD wallet without its encrypted phrase");
  } else if (f.kdf !== undefined || f.cipher !== undefined || f.encryptedPayload !== undefined) {
    throw bad("a watch-only wallet that carries encrypted material");
  }
  const state = (f.state ?? { accounts: {} }) as HdWalletKeystoreState;
  if (!state || typeof state !== "object" || typeof state.accounts !== "object" || state.accounts === null) throw bad("state");
  for (const [k, v] of Object.entries(state.accounts)) {
    if (!/^\d+$/.test(k) || !isInt(v?.nextReceive) || !isInt(v?.nextChange)) throw bad("state.accounts");
  }
  return { ...f, state };
}

/** The file of `walletId` under a workspace root (the id is checked first: no path traversal). */
export function hdWalletKeystorePath(workspaceRoot: string, walletId: string): string {
  if (!isHdWalletId(walletId)) throw err("HD_WALLET_KEYSTORE_INVALID", `${JSON.stringify(walletId)} is not a wallet id (32 hex characters).`);
  return path.join(workspaceRoot, HD_WALLETS_DIR, `${walletId}.json`);
}

/** Reads and validates a wallet file; its name must be its header's wallet id (a swapped file is refused). */
export function readHdWalletKeystoreSync(filePath: string): EncryptedHdWalletKeystoreV1 {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") throw err("HD_WALLET_NOT_FOUND", `No wallet file at ${filePath}.`);
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(stripBom(raw));
  } catch {
    throw err("HD_WALLET_KEYSTORE_INVALID", `The wallet file ${path.basename(filePath)} is not JSON.`);
  }
  const file = parseHdWalletKeystore(json, `wallet file ${path.basename(filePath)}`);
  if (path.basename(filePath) !== `${file.header.walletId}.json`) {
    throw err("HD_WALLET_KEYSTORE_INVALID", `The wallet file ${path.basename(filePath)} declares wallet id ${file.header.walletId}: a file is named after its own id.`);
  }
  return file;
}

/** Writes a wallet file atomically with mode 0600 (the account keystore's write). */
export async function writeHdWalletKeystore(filePath: string, file: EncryptedHdWalletKeystoreV1): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, JSON.stringify(file, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}
