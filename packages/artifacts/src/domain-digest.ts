import { createHash } from "node:crypto";
import {
  CURRENT_HASH_VERSION,
  HashVersionInvalidError,
  calculateContentHash,
  canonicalStringifyUnexcluded,
  readDeclaredHashVersion
} from "./canonical.js";

// Wave 1.3 · Closure Pack IC-1′.7 (N7, digest half)
//
// A DOMAIN digest (stateHash, utxoSetHash, accountsHash, intentHash, synthetic
// transaction ids, …) is not an artifact identity. It is computed by THIS
// function: a canonical form with NO exclusions at any depth and its own
// algorithm version, never by `calculateContentHash` (whose exclusion lists
// exist for artifact bodies only). The pre-1.3 digests were the canonical-v4
// artifact form; they are kept, under an explicit name, only to verify and
// replay artifacts that declare hashVersion ≤ 4.

/** Current algorithm version of the domain-digest function. */
export const CURRENT_DOMAIN_DIGEST_VERSION = 1;

/** Marker for the frozen pre-1.3 algorithm (canonical v4 form with name exclusions). */
export const LEGACY_DOMAIN_DIGEST = "legacy" as const;

export type DomainDigestVersion = typeof CURRENT_DOMAIN_DIGEST_VERSION | typeof LEGACY_DOMAIN_DIGEST;

/**
 * SHA-256 of the unexcluded canonical form of `value`.
 * Version 1 is the only current algorithm; the function is versioned so a future
 * change is explicit in every caller.
 */
export function domainDigest(value: unknown, version: number = CURRENT_DOMAIN_DIGEST_VERSION): string {
  if (version !== CURRENT_DOMAIN_DIGEST_VERSION) {
    throw new Error(`DOMAIN_DIGEST_VERSION_INVALID: unsupported domain digest version ${JSON.stringify(version)}`);
  }
  return createHash("sha256").update(canonicalStringifyUnexcluded(value)).digest("hex");
}

/**
 * The frozen pre-1.3 digest: the canonical-v4 artifact form (name exclusions at
 * any depth). Only for verifying/replaying artifacts that declare hashVersion ≤ 4.
 */
export function legacyDomainDigest(value: unknown): string {
  return calculateContentHash(value, 4);
}

/**
 * Which digest algorithm an artifact's domain digests use, selected by the
 * artifact's DECLARED hashVersion: ≤ 4 → the legacy digest, 5 → version 1.
 * An invalid declaration is an error, never a guess (IC-4′.2).
 */
export function domainDigestVersionFor(hashVersion: unknown): DomainDigestVersion {
  const declared = readDeclaredHashVersion({ hashVersion });
  if (declared === null) throw new HashVersionInvalidError(hashVersion);
  return declared >= CURRENT_HASH_VERSION ? CURRENT_DOMAIN_DIGEST_VERSION : LEGACY_DOMAIN_DIGEST;
}

/** Digest of `value` with the algorithm that belongs to an artifact declaring `hashVersion`. */
export function domainDigestForHashVersion(value: unknown, hashVersion: unknown): string {
  const version = domainDigestVersionFor(hashVersion);
  return version === LEGACY_DOMAIN_DIGEST ? legacyDomainDigest(value) : domainDigest(value, version);
}
