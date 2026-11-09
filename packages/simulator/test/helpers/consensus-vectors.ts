/*
 * Shared material for the consensus-parity suites of the simulator (offline `consensus-rules.test.ts` and the node-level
 * `consensus-vectors.simnet.test.ts`): deterministic simnet-only keys, script builders and the SilverScript templates
 * the X1 counter-audit vectors use (rusty-kaspad v2.1.0 verdicts recorded in notes/ca/X1-simulator-vectors.md).
 * The keys are derived from public labels: they exist only for simnet tests and must never hold value.
 */
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { schnorr } from "@noble/curves/secp256k1";

export const REPO_ROOT = path.resolve(__dirname, "../../../..");

export interface VectorKey {
  readonly label: string;
  /** 32-byte private key, hex. */
  readonly priv: string;
  /** 32-byte x-only public key, hex. */
  readonly xonly: string;
}

export function vectorKey(label: string): VectorKey {
  const priv = Buffer.from(sha256(new TextEncoder().encode(`hardkas-sim-consensus-vectors:${label}`))).toString("hex");
  const xonly = Buffer.from(schnorr.getPublicKey(Buffer.from(priv, "hex"))).toString("hex");
  return { label, priv, xonly };
}

export const KEYS = {
  miner: vectorKey("miner"),
  sender: vectorKey("sender"),
  recipient: vectorKey("recipient"),
  owner: vectorKey("owner"),
  attacker: vectorKey("attacker")
};

export const U64_MAX = (1n << 64n) - 1n;
export const ZERO_HASH = "00".repeat(32);

/** Minimal push of `hex` (OP_0, OP_DATA_n, OP_PUSHDATA1/2). */
export function pushData(hex: string): string {
  const n = hex.length / 2;
  if (n === 0) return "00";
  if (n <= 75) return n.toString(16).padStart(2, "0") + hex;
  if (n <= 255) return "4c" + n.toString(16).padStart(2, "0") + hex;
  return "4d" + (n & 0xff).toString(16).padStart(2, "0") + (n >> 8).toString(16).padStart(2, "0") + hex;
}

/** Minimal script-number encoding (serialize_i64), without the push opcode. */
export function scriptNum(n: bigint): string {
  if (n === 0n) return "";
  const neg = n < 0n;
  let m = neg ? -n : n;
  const bytes: number[] = [];
  while (m > 0n) {
    bytes.push(Number(m & 0xffn));
    m >>= 8n;
  }
  if ((bytes[bytes.length - 1]! & 0x80) !== 0) bytes.push(0);
  if (neg) bytes[bytes.length - 1]! |= 0x80;
  return Buffer.from(bytes).toString("hex");
}

/** ScriptBuilder::add_i64: OP_0 / OP_1NEGATE / OP_1..OP_16, or a data push of the script number. */
export function pushI64(n: bigint): string {
  if (n === 0n) return "00";
  if (n === -1n) return "4f";
  if (n >= 1n && n <= 16n) return (0x50 + Number(n)).toString(16);
  return pushData(scriptNum(n));
}

/** ScriptBuilder::add_lock_time / add_sequence: the u64 as little endian with trailing zero bytes removed, pushed. */
export function pushU64Le(n: bigint): string {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  let len = 8;
  while (len > 0 && b[len - 1] === 0) len--;
  return pushData(b.subarray(0, len).toString("hex"));
}

export const p2pkScript = (xonly: string) => `20${xonly}ac`;
export const p2shScript = (redeemHex: string) =>
  `aa20${Buffer.from(blake2b(Buffer.from(redeemHex, "hex"), { dkLen: 32 })).toString("hex")}87`;

/** Redeem scripts of the X1 vectors (same bytes, keys from KEYS). */
export const REDEEM = {
  /** <1> CLTV DROP TRUE (Bitcoin pattern). */
  A: "51b07551",
  /** <1> CLTV TRUE (Kaspa pattern). */
  B: "51b051",
  /** <1> CLTV <owner> CHECKSIG. */
  B2: `51b020${KEYS.owner.xonly}ac`,
  /** <6e11 as 6-byte script number> CLTV TRUE. */
  C2: `${pushData("0070c9b28b00")}b051`,
  /** ScriptBuilder.addLockTime(6e11) CLTV TRUE. */
  C2b: `${pushU64Le(600_000_000_000n)}b051`,
  /** <0x80> CLTV TRUE. */
  C4: "0180b051",
  TRUE: "51",
  /** ScriptBuilder.addSequence(2^63 | 1) CSV TRUE. */
  D: `${pushU64Le((1n << 63n) | 1n)}b151`,
  /** <1> CSV TRUE. */
  CSV1: "51b151",
  H2: "5151",
  H3: "51".repeat(245) + "75".repeat(244),
  /** <owner> CHECKSIG NOT. */
  H4: `20${KEYS.owner.xonly}ac91`,
  /** 0 OUTPUTCOVENANTID <ZERO_HASH> EQUAL. */
  G3: `00d520${ZERO_HASH}87`,
  /** 0 OUTPUTAUTHORIZINGINPUT -1 NUMEQUAL. */
  G4: "00d64f9c",
  /** 0 AUTHOUTPUTCOUNT 1 NUMEQUAL. */
  CNT: "00cb519c",
  /** <1> CLTV DROP <owner> CHECKSIG (canonical Bitcoin refund). */
  BTC: `51b07520${KEYS.owner.xonly}ac`,
  /** <owner> <1> CLTV DROP CHECKSIG (Bitcoin-valid variant). */
  INV: `20${KEYS.owner.xonly}51b075ac`
} as const;

export interface SilverTemplates {
  /** TransferWithTimeout (fixtures/toccata-v2/silver/p2sh-transfer-with-timeout), recipient/sender replaced in place. */
  readonly TWT: string;
  /** TimeLockSig.claim(sig s, temporal t) { require(tx.time >= t); require(checkSig(s, owner)); } (silverc 1.0.0). */
  readonly TLS: string;
  /** AbiVectors (packages/core/test/fixtures/silverscript-v1/abi-vectors.artifact.json). */
  readonly ABI: string;
}

/** Entrypoint selectors silverc 1.0.0 emitted for these templates. */
export const SELECTOR = { transfer: "de5ac30f", reclaim: "35eecca6", claim: "cfb471e0", timed: "d4ea0dc7" } as const;

export function loadSilverTemplates(): SilverTemplates {
  const twtArt = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "fixtures/toccata-v2/silver/p2sh-transfer-with-timeout/contract.artifact.json"), "utf8")
  );
  const twtOrig = Buffer.from(twtArt.contracts.TransferWithTimeout.compiled.bytecode).toString("hex");
  const TWT = twtOrig
    .replace("a9e65b64f9284a44e624db99ec03e7c27a177b58e83ff344cefc3905dbf4864e", KEYS.recipient.xonly)
    .replace("a814c9b3ed54a60b80fc19b7464d0d0a58d27e239530a7b1053a97d60e8937a7", KEYS.sender.xonly);
  if (TWT.length !== twtOrig.length || TWT === twtOrig) throw new Error("TransferWithTimeout key substitution failed");
  const abiArt = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "packages/core/test/fixtures/silverscript-v1/abi-vectors.artifact.json"), "utf8")
  );
  const ABI = Buffer.from(abiArt.contracts.AbiVectors.compiled.bytecode).toString("hex");
  // silverc 1.0.0 output for TimeLockSig (74 bytes; artifact sha256 of the counter-audit run in X1 §2.2), owner key in place.
  const TLS = `7604${SELECTOR.claim}876375788201419d757682599f69757676050088526a74a269b07820${KEYS.owner.xonly}ac69757551676a68`;
  return { TWT, TLS, ABI };
}
