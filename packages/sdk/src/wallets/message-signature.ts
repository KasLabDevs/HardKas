import { walletRefusal } from "./errors.js";
import { addressNetworkFamily, isMainnetName } from "./networks.js";

/*
 * R3-C · a browser wallet's `signMessage` answer, verified (NOTES-CROSSCHECK §2.3 item 7, UNVERIFIED against the live
 * extensions). BROWSER-SAFE: no Node import; the kaspa-wasm module that verifies is handed in (the page's own, or the
 * managed one on the Node side: wallet-payments.ts `verifyWalletMessage`). Per the notes a wallet answers in one of three
 * shapes:
 *  - KasWare 0.11: 128 hex characters (the 64-byte Schnorr signature);
 *  - older KasWare: 88 base64 characters (the same 64 bytes); a 65-byte decoding is a compact ECDSA/Bitcoin-style message
 *    signature, which kaspa-wasm's `verifyMessage` does not verify: refused, never guessed;
 *  - Kaspire: `{ address, signature }`, the address the wallet says signed (it must be the expected one).
 * The signature is verified with kaspa-wasm's `verifyMessage` against the x-only key of the expected Schnorr P2PK
 * address (read from its script by kaspa-wasm: no hand-written bech32). Anything else is a typed refusal:
 * WALLET_MESSAGE_SIGNATURE_UNREADABLE (a shape HardKAS cannot use), WALLET_MESSAGE_ADDRESS_MISMATCH (Kaspire named
 * another address), WALLET_MESSAGE_SIGNATURE_INVALID (it does not verify), WALLET_ADDRESS_UNSUPPORTED (not a Schnorr P2PK
 * address), MAINNET_SIGNING_DISABLED (a mainnet address: refused like every path).
 */

export type WalletMessageSignatureShape = "hex" | "base64" | "object";

export interface WalletMessageSignature {
  /** The 64-byte Schnorr signature, lower-case hex. */
  readonly signatureHex: string;
  readonly shape: WalletMessageSignatureShape;
  /** The address the wallet stated with the signature (Kaspire), if any. */
  readonly statedAddress?: string | undefined;
}

/** The subset of kaspa-wasm the verification uses (the managed Node module or a page's web build). */
export interface KaspaMessageVerifier {
  verifyMessage(value: { message: string; signature: string; publicKey: string }): boolean;
  payToAddressScript(address: any): { script: string; version: number } | any;
  Address: new (address: string) => any;
}

const unreadable = (why: string) =>
  walletRefusal("WALLET_MESSAGE_SIGNATURE_UNREADABLE", `The wallet's message signature is not one HardKAS can verify (${why}). Nothing was accepted.`);

function base64Bytes(text: string): Uint8Array | undefined {
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

const hexOf = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** One of the three shapes a wallet answers `signMessage` with, as the 64-byte signature (see the header). */
export function normalizeWalletMessageSignature(returned: unknown): WalletMessageSignature {
  if (returned && typeof returned === "object" && !Array.isArray(returned)) {
    const o = returned as Record<string, unknown>;
    if (typeof o.signature !== "string") throw unreadable("an object without a string `signature`");
    if (o.address !== undefined && typeof o.address !== "string") throw unreadable("an object whose `address` is not a string");
    const inner = normalizeWalletMessageSignature(o.signature);
    return { signatureHex: inner.signatureHex, shape: "object", ...(typeof o.address === "string" ? { statedAddress: o.address } : {}) };
  }
  if (typeof returned !== "string") throw unreadable(returned === undefined ? "nothing" : `a ${Array.isArray(returned) ? "list" : typeof returned}`);
  const text = returned.trim();
  let hex: string | undefined;
  let shape: WalletMessageSignatureShape;
  if (/^[0-9a-fA-F]{128}$/.test(text)) {
    hex = text.toLowerCase();
    shape = "hex";
  } else if (text.length === 88 && /^[A-Za-z0-9+/]{86}[A-Za-z0-9+/=]{2}$/.test(text)) {
    const bytes = base64Bytes(text);
    if (!bytes) throw unreadable("88 characters that are not base64");
    if (bytes.length === 65) throw unreadable("an 88-character base64 signature of 65 bytes: a compact ECDSA (Bitcoin-style) message signature, which kaspa-wasm's verifyMessage does not verify");
    if (bytes.length !== 64) throw unreadable(`an 88-character base64 signature of ${bytes.length} bytes, not 64`);
    hex = hexOf(bytes);
    shape = "base64";
  } else {
    throw unreadable(`a text of ${text.length} characters, neither 128 hex nor 88 base64`);
  }
  if (/^0+$/.test(hex)) throw unreadable("a zeroed signature");
  return { signatureHex: hex, shape };
}

/**
 * Verifies a wallet's `signMessage` answer for `message` against the expected `address` with kaspa-wasm (`kaspa`, the
 * module that verifies). Returns the normalized signature and the key it verified against; refuses (typed) otherwise.
 */
export function verifyWalletMessageSignature(input: {
  readonly kaspa: KaspaMessageVerifier;
  readonly address: string;
  readonly message: string;
  readonly returned: unknown;
}): WalletMessageSignature & { readonly publicKey: string } {
  if (addressNetworkFamily(input.address) === "mainnet" || isMainnetName(input.address)) {
    throw walletRefusal("MAINNET_SIGNING_DISABLED", `${input.address} is a mainnet address: mainnet is disabled in this HardKAS release on every path, message signatures included.`);
  }
  if (typeof input.message !== "string" || input.message.length === 0) throw walletRefusal("WALLET_SIGN_REQUEST_INVALID", "the message to verify is empty.");
  const normalized = normalizeWalletMessageSignature(input.returned);
  if (normalized.statedAddress !== undefined && normalized.statedAddress !== input.address) {
    throw walletRefusal(
      "WALLET_MESSAGE_ADDRESS_MISMATCH",
      `the wallet says ${normalized.statedAddress} signed the message, not the expected ${input.address}. Nothing was accepted.`,
      { address: input.address, statedAddress: normalized.statedAddress }
    );
  }
  let publicKey: string | undefined;
  try {
    const spk = input.kaspa.payToAddressScript(new input.kaspa.Address(input.address));
    const m = /^20([0-9a-f]{64})ac$/.exec(String(spk?.script ?? "").toLowerCase());
    if (m && Number(spk?.version ?? 0) === 0) publicKey = m[1];
  } catch {
    publicKey = undefined;
  }
  if (publicKey === undefined) {
    throw walletRefusal("WALLET_ADDRESS_UNSUPPORTED", `${input.address} is not a Schnorr P2PK address: its key cannot verify a wallet's message signature.`, { address: input.address });
  }
  let valid = false;
  try {
    valid = input.kaspa.verifyMessage({ message: input.message, signature: normalized.signatureHex, publicKey }) === true;
  } catch {
    valid = false;
  }
  if (!valid) {
    throw walletRefusal(
      "WALLET_MESSAGE_SIGNATURE_INVALID",
      `the message signature does not verify against ${input.address} (key ${publicKey}) for this message: another key, another message, or a wallet that signs messages another way. Nothing was accepted.`,
      { address: input.address }
    );
  }
  return { ...normalized, publicKey };
}
