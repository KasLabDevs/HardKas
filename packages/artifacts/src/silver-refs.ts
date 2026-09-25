import { createHash } from "node:crypto";
import { checkArtifactIdentity } from "./resolve.js";
import type { VerificationIssue } from "./verify.js";

// -----------------------------------------------------------------------------
// Wave 1.2 · N1 (reference half) · Closure Pack IC-5′.6
//
// Silver records reference each other with `{ path, contentHash, artifactSha256? }`
// (`compileRecord`, `deployRecord`, `previous`). The `path` is only a hint: the
// target MUST hash (under the version it declares) to the referenced contentHash,
// and every additional authenticated digest MUST be crossed. Under hashVersion 4 the
// nested `contentHash` is unauthenticated by name, but `artifactSha256` is not: a
// swapped compile record is therefore caught even for legacy records.
// -----------------------------------------------------------------------------

export interface SilverRecordReference {
  path: string;
  contentHash: string;
  artifactSha256?: string | undefined;
}

export interface SilverReferenceCheck {
  ok: boolean;
  /** The target's recomputed identity when it verified. */
  artifactId?: string;
  issues: VerificationIssue[];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function verifySilverRecordReference(ref: SilverRecordReference, target: any): SilverReferenceCheck {
  const issues: VerificationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ code, severity: "error", message });

  if (!target || typeof target !== "object") {
    err("REFERENCE_MISSING", `Referenced record ${ref.path} could not be loaded`);
    return { ok: false, issues };
  }
  if (typeof ref.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(ref.contentHash)) {
    err("REFERENCE_INVALID", `Reference to ${ref.path} does not carry a 64-hex contentHash`);
    return { ok: false, issues };
  }

  const identity = checkArtifactIdentity(target);
  if (!identity.ok) {
    err("CANDIDATE_INVALID", `Referenced record ${ref.path} does not verify: ${identity.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`);
    return { ok: false, issues };
  }
  if (identity.artifactId !== ref.contentHash) {
    err("REFERENCE_HASH_MISMATCH", `Reference expects ${ref.contentHash} but ${ref.path} hashes to ${identity.artifactId}`);
  }

  if (typeof ref.artifactSha256 === "string" && ref.artifactSha256.length > 0) {
    const bodyDigest = typeof target.artifactJson === "string" ? sha256(target.artifactJson) : null;
    const declared = target?.provenance?.artifactSha256;
    if (bodyDigest !== ref.artifactSha256 || declared !== ref.artifactSha256) {
      err(
        "SILVER_REFERENCE_DIGEST_MISMATCH",
        `Reference expects artifactSha256 ${ref.artifactSha256} but ${ref.path} carries ${String(declared)} (body digest ${String(bodyDigest)})`
      );
    }
  }

  return { ok: issues.length === 0, artifactId: identity.artifactId, issues };
}
