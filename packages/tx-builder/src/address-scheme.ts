import { GeneratorPlanError } from "./generator-plan.js";

/*
 * RC1 · D7 · the address schemes a HardKAS spend can come FROM. The accounts signer signs Schnorr P2PK only (and the v1
 * engine its own contract unlocks), so a spend from an ECDSA P2PK address (version 1, script `21 <33-byte key> ab`) can
 * never be signed by HardKAS: it is refused when it is planned and when it is signed (ECDSA_SPEND_NOT_SUPPORTED),
 * instead of being priced as Schnorr and failing later. Paying TO an ECDSA address is unaffected. Design for a later
 * cycle: docs/proposals/cltv-and-ecdsa-spends.md.
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/**
 * The version byte of a Kaspa address (0 Schnorr P2PK, 1 ECDSA P2PK, 8 P2SH), read from the first two 5-bit groups of
 * its payload; undefined for anything that is not `<prefix>:<bech32 data>` (the simulator's `kaspa:sim_*` included).
 * The checksum is not verified here: the node and kaspa-wasm do that.
 */
export function kaspaAddressVersion(address: unknown): number | undefined {
  if (typeof address !== "string") return undefined;
  const sep = address.lastIndexOf(":");
  if (sep <= 0) return undefined;
  const data = address.slice(sep + 1).toLowerCase();
  if (data.length < 10) return undefined;
  const a = CHARSET.indexOf(data[0]!);
  const b = CHARSET.indexOf(data[1]!);
  if (a < 0 || b < 0) return undefined;
  for (const ch of data) if (CHARSET.indexOf(ch) < 0) return undefined;
  return ((a << 3) | (b >> 2)) & 0xff;
}

/** A P2PK ECDSA script public key (`21 <02|03 + 32 bytes> ab`), bare or with its 2-byte version prefix (`0000`). */
export function isEcdsaP2pkScript(scriptPublicKey: unknown): boolean {
  const spk = scriptPublicKey as { scriptPublicKey?: unknown; script?: unknown } | string | undefined;
  const raw = typeof spk === "string" ? spk : typeof spk?.scriptPublicKey === "string" ? spk.scriptPublicKey : typeof spk?.script === "string" ? spk.script : undefined;
  if (typeof raw !== "string") return false;
  const hex = raw.toLowerCase();
  // 35 bytes (70 hex) bare: 0x21, the 33-byte compressed key, OP_CHECKSIGECDSA (0xab); 74 hex with the version prefix
  const bare = hex.length === 70 ? hex : hex.length === 74 && hex.startsWith("0000") ? hex.slice(4) : undefined;
  return bare !== undefined && /^21(02|03)[0-9a-f]{64}ab$/.test(bare);
}

/** The typed refusal of a spend from an ECDSA address (what spends: "the sender", "input 0"…). */
export function ecdsaSpendNotSupported(what: string, address?: string): GeneratorPlanError {
  return new GeneratorPlanError(
    "ECDSA_SPEND_NOT_SUPPORTED",
    `${what}${address ? ` (${address})` : ""} is an ECDSA P2PK address: HardKAS signs Schnorr P2PK spends only, so it does not ` +
      `plan or sign a spend from it in this release. Paying TO an ECDSA address is supported. Nothing was planned or signed.`
  );
}

/** Refuses a spend whose source is an ECDSA address (by its version byte). */
export function assertSpendableAddressScheme(address: unknown, what: string): void {
  if (kaspaAddressVersion(address) === 1) throw ecdsaSpendNotSupported(what, String(address));
}
