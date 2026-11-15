import { kaspaAddressVersion } from "@hardkas/tx-builder";

/*
 * ECDSA spends · the signature scheme of an account. A Kaspa key has two P2PK addresses: Schnorr (version 0, script
 * `20 <32-byte x-only key> ac`) and ECDSA (version 1, script `21 <33-byte compressed key> ab`). An account owns the one its
 * recorded scheme names (absent = Schnorr, every account before ECDSA), and the two must agree, typed: funds sent to the
 * other address of the same key look lost to a wallet that derives one scheme only.
 */

export type AccountKeyScheme = "schnorr" | "ecdsa";

function schemeError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

/**
 * The scheme of an account (`keyScheme`: "ecdsa", or "schnorr"/absent), checked against its address's version:
 * ACCOUNT_KEY_SCHEME_INVALID for another value, ACCOUNT_KEY_SCHEME_MISMATCH when the address is of the other scheme
 * (an ECDSA address on an account that records none, or the reverse). An address that is not a Kaspa P2PK address
 * (the simulator's identities) is not checked.
 */
export function accountKeyScheme(account: { readonly name?: string; readonly address?: unknown; readonly keyScheme?: unknown }): AccountKeyScheme {
  const stated = account.keyScheme;
  if (stated !== undefined && stated !== "schnorr" && stated !== "ecdsa") {
    throw schemeError("ACCOUNT_KEY_SCHEME_INVALID", `account '${account.name ?? "?"}' records the key scheme ${JSON.stringify(stated)}; a scheme is "schnorr" or "ecdsa".`);
  }
  const scheme: AccountKeyScheme = stated === "ecdsa" ? "ecdsa" : "schnorr";
  const version = kaspaAddressVersion(account.address);
  if ((version === 0 && scheme !== "schnorr") || (version === 1 && scheme !== "ecdsa")) {
    throw schemeError(
      "ACCOUNT_KEY_SCHEME_MISMATCH",
      `account '${account.name ?? "?"}' records the ${scheme === "ecdsa" ? "ECDSA" : "Schnorr"} scheme and its address ${String(account.address)} is ` +
        `a${version === 1 ? "n ECDSA" : " Schnorr"} P2PK address: the account's scheme and its address must agree` +
        (version === 1 ? " (import or generate an ECDSA account with --ecdsa)." : ".")
    );
  }
  return scheme;
}

/** The P2PK address of `privateKey` under `scheme` on the network with address prefix `prefix` (kaspa-wasm). */
export function addressOfKeyByScheme(sdk: any, privateKey: string, prefix: string, scheme: AccountKeyScheme): string {
  const pub = new sdk.PrivateKey(privateKey).toPublicKey();
  return String((scheme === "ecdsa" ? pub.toAddressECDSA(prefix) : pub.toAddress(prefix)).toString());
}
