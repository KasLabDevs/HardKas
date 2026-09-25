import { createHash } from "node:crypto";
import { deterministicCompare } from "@hardkas/core";

/**
 * Legacy exclusion set (hash versions 1–3): keys dropped BY NAME AT ANY DEPTH.
 * Frozen: only used to verify artifacts that declare those versions.
 */
export const SEMANTIC_EXCLUSIONS = new Set([
  "contentHash",
  "artifactId",
  "planId",
  "lineage",
  "createdAt",
  "rpcUrl",
  "rpcHost",
  "latencyMs",
  "indexedAt",
  "file_path",
  "file_mtime_ms",
  "hardkasVersion",
  "hashVersion", // Exclude hash version from hash
  "parentArtifactId",
  "signedId",
  "deployedAt",
  "tracePath",
  "receiptPath",
  "events",
  "status",
  "sourceSignedId",
  "submittedAt",
  "confirmedAt",
  "dagContext",
  "executionId",
  "signatureMetadata"
]);

/**
 * Legacy exclusion set (hash version 4): keys dropped BY NAME AT ANY DEPTH.
 * Frozen: only used to verify artifacts that declare version 4. This rule is
 * what let `status`, `sourceSignedId`, `dagContext` and nested references
 * change without touching the hash (audit AUD-11 / P1–P3 / R1–R3 / N1).
 */
export const V4_SEMANTIC_EXCLUSIONS = new Set([
  // Core Hash Identity
  "contentHash",
  "artifactId",
  "planId",
  "signedId",
  "hashVersion",
  // Runtime/Display fields (user requested)
  "filePath",
  "file_path",
  "workspacePath",
  "debug",
  "logs",
  "uiHints",
  "cache",
  "lastViewedAt",
  // Other runtime fields that must not break hash
  "createdAt",
  "events",
  "status",
  "submittedAt",
  "confirmedAt",
  "dagContext",
  "executionId",
  "deployedAt",
  "tracePath",
  "receiptPath",
  "sourceSignedId",
  "signatureMetadata",
  "rpcHost",
  "rpcUrl",
  "latencyMs",
  "indexedAt",
  "file_mtime_ms",
  "hardkasVersion"
]);

/**
 * Hash version 5 (Closure Pack IC-1′.1b): the CLOSED list of operational
 * fields that are never authenticated, matched ONLY at the top level of the
 * artifact. Everything nested is authenticated. Adding a name here widens what
 * an adversary may change without detection: it is a contract change, and the
 * schema-introspection test must be updated with it.
 */
export const V5_UNAUTHENTICATED: ReadonlySet<string> = new Set([
  "createdAt",
  "submittedAt",
  "confirmedAt",
  "deployedAt",
  "executionId",
  "tracePath",
  "receiptPath",
  "filePath",
  "file_path",
  "workspacePath",
  "debug",
  "logs",
  "uiHints",
  "cache",
  "lastViewedAt",
  "indexedAt",
  "file_mtime_ms",
  "latencyMs",
  "rpcHost",
  "rpcUrl",
  "hardkasVersion",
  "signatureMetadata"
]);

/**
 * Hash version 5 (IC-1′.1c): labels derived from the hash. Excluded from the
 * hash and RECOMPUTED by the verifier (`plan-<16hex>`, `signed-<16hex>`).
 */
export const V5_DERIVED_LABELS: ReadonlySet<string> = new Set(["planId", "signedId"]);

/**
 * Hash version 5 (IC-1′.1a): self references excluded by EXACT PATH. A
 * `contentHash` anywhere else (for example inside a reference) is authenticated.
 */
export const V5_SELF_REFERENCE_PATHS: readonly string[] = ["contentHash", "lineage.artifactId"];

/**
 * Current canonicalization version.
 * v1: BigInt(123) -> "123" (Collision with String "123")
 * v2: BigInt(123) -> "n:123" (Distinguishable)
 * v3: String normalization (\r\n -> \n, NFC) for cross-platform stability.
 * v4: Strict Metadata Integrity (includes lineage, parentArtifactId, signatureMetadata, etc in the hash).
 * v5: Closed top-level exclusion list, exact-path self references, derived labels
 *     recomputed by the verifier, `hashVersion` authenticated, no exclusion by key
 *     name at depth (Closure Pack IC-1′, decision Q1-B′).
 */
export const CURRENT_HASH_VERSION = 5;
export const MIN_HASH_VERSION = 1;

export const STRICT_PATH_KEYS = new Set([
  "file_path",
  "sandboxSnapshotPath",
  "receiptPath",
  "tracePath",
  "outputPath",
  "artifactPath",
  "workspacePath",
  "relativePath",
  "absolutePath"
]);

/** Error thrown when an artifact's declared `hashVersion` is not an integer in the supported range. */
export class HashVersionInvalidError extends Error {
  readonly code = "HASH_VERSION_INVALID";
  constructor(declared: unknown) {
    super(
      `HASH_VERSION_INVALID: hashVersion must be an integer between ${MIN_HASH_VERSION} and ${CURRENT_HASH_VERSION}, got ${JSON.stringify(declared)}`
    );
    this.name = "HashVersionInvalidError";
  }
}

/**
 * The hash version an artifact declares, or `null` when it declares none or an
 * invalid one. Strings, floats, out-of-range numbers and absence are all
 * invalid: no reader may fall back to another version (IC-4′.2).
 */
export function readDeclaredHashVersion(artifact: unknown): number | null {
  if (!artifact || typeof artifact !== "object") return null;
  const declared = (artifact as Record<string, unknown>).hashVersion;
  if (typeof declared !== "number" || !Number.isInteger(declared)) return null;
  if (declared < MIN_HASH_VERSION || declared > CURRENT_HASH_VERSION) return null;
  return declared;
}

/**
 * Recomputes an artifact's content hash with the version it DECLARES. This is
 * the single function to use outside a producer (IC-1′.8): a bare
 * `calculateContentHash(x)` would silently apply the current version to a legacy
 * artifact and report a false mismatch.
 */
export function recomputeDeclaredContentHash(artifact: unknown): string {
  const version = readDeclaredHashVersion(artifact);
  if (version === null) throw new HashVersionInvalidError((artifact as Record<string, unknown> | null)?.hashVersion);
  return calculateContentHash(artifact, version);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether a key is excluded from the hash under `version`, given where it sits.
 * `depth` 0 is the artifact's own top level; `parentKey` names the enclosing key.
 */
function isExcluded(key: string, version: number, depth: number, parentKey: string | undefined): boolean {
  if (version >= 5) {
    if (depth === 0) return key === "contentHash" || V5_UNAUTHENTICATED.has(key) || V5_DERIVED_LABELS.has(key);
    if (depth === 1 && parentKey === "lineage") return key === "artifactId";
    return false;
  }
  const exclusions = version >= 4 ? V4_SEMANTIC_EXCLUSIONS : SEMANTIC_EXCLUSIONS;
  return exclusions.has(key);
}

function serialize(
  obj: unknown,
  version: number,
  keyName: string | undefined,
  isRoot: boolean,
  depth: number,
  parentKey: string | undefined
): string {
  if (typeof obj === "symbol" || typeof obj === "function") {
    throw new Error(`Type ${typeof obj} is not canonicalizable.`);
  }

  if (typeof obj === "undefined") {
    if (isRoot) {
      throw new Error(`Type undefined is not canonicalizable at the root.`);
    }
    // Inside arrays, JSON.stringify(undefined) becomes null.
    // Object properties with undefined are filtered out before calling canonicalStringify.
    return "null";
  }

  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") {
      // v2+ adds a type marker to distinguish BigInt from String.
      // v1 was just JSON.stringify(obj.toString())
      if (version >= 2) {
        return JSON.stringify(`n:${obj.toString()}`);
      }
      return JSON.stringify(obj.toString());
    }

    if (typeof obj === "string" && version >= 3) {
      // v3+ normalizes newlines and UTF-8 for cross-platform stability.
      let normalized = obj.normalize("NFC").replace(/\r\n/g, "\n");

      // Convert Windows backslashes to POSIX forward slashes only for strict path-typed fields
      if (keyName && STRICT_PATH_KEYS.has(keyName)) {
        normalized = normalized.replace(/\\/g, "/");
      }
      return JSON.stringify(normalized);
    }

    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    // Array elements are not "top-level fields": they get depth 1 with no parent key,
    // so no v5 exclusion applies inside them.
    return "[" + obj.map((item) => serialize(item, version, keyName, false, depth + 1, undefined)).join(",") + "]";
  }

  if (obj instanceof Map) {
    throw new Error("Map is not canonicalizable. Use a plain object.");
  }
  if (obj instanceof Set) {
    throw new Error("Set is not canonicalizable. Use an array.");
  }
  if (obj instanceof Date) {
    throw new Error("Date must be serialized explicitly.");
  }

  if (!isPlainObject(obj)) {
    throw new Error("Non-plain object encountered in canonicalizer.");
  }

  const sortedKeys = Object.keys(obj)
    .filter((key) => !isExcluded(key, version, depth, parentKey) && obj[key] !== undefined)
    .sort(deterministicCompare);

  const result = sortedKeys
    .map((key) => JSON.stringify(key) + ":" + serialize(obj[key], version, key, false, depth + 1, key))
    .join(",");

  return "{" + result + "}";
}

/**
 * Deterministically stringifies an object by sorting keys recursively.
 * Handles BigInt by converting to string with type marker.
 * Versions 1–4 drop the version's exclusion set by key name at any depth
 * (legacy, frozen). Version 5 drops only the closed top-level list, the derived
 * labels and the exact-path self references.
 * Skips keys with undefined values (matching JSON.stringify behavior).
 */
export function canonicalStringify(
  obj: unknown,
  version: number = CURRENT_HASH_VERSION,
  keyName?: string,
  isRoot: boolean = true
): string {
  return serialize(obj, version, keyName, isRoot, 0, undefined);
}

/**
 * Calculates a SHA-256 hash of the canonical JSON representation under `version`.
 * Producers pass the version they write into the artifact; everything else must
 * use {@link recomputeDeclaredContentHash}.
 */
export function calculateContentHash(
  obj: unknown,
  version: number = CURRENT_HASH_VERSION
): string {
  const canonical = canonicalStringify(obj, version);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Paths of fields present in `artifact` that a legacy hash version never
 * authenticated but the current version would. Reported by the verifier for
 * legacy artifacts (D-Q1.e / IC-4′.3) so a consumer knows exactly which values
 * it must not trust.
 */
export function legacyUnauthenticatedMaterialFields(artifact: unknown, version: number): string[] {
  if (version >= CURRENT_HASH_VERSION) return [];
  const out: string[] = [];
  const visit = (value: unknown, depth: number, parentKey: string | undefined, pathPrefix: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, depth + 1, undefined, `${pathPrefix}[${index}]`));
      return;
    }
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
      if (value[key] === undefined) continue;
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      const legacyDrops = isExcluded(key, version, depth, parentKey);
      const currentDrops = isExcluded(key, CURRENT_HASH_VERSION, depth, parentKey);
      if (legacyDrops && !currentDrops) {
        out.push(path);
        continue; // the whole subtree was unauthenticated
      }
      if (!legacyDrops) visit(value[key], depth + 1, key, path);
    }
  };
  visit(artifact, 0, undefined, "");
  return out;
}
