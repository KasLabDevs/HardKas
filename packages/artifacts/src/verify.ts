import fs from "node:fs";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/core";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  MIN_HASH_VERSION,
  legacyUnauthenticatedMaterialFields,
  readDeclaredHashVersion
} from "./canonical.js";
import {
  SnapshotSchema,
  TxPlanSchema,
  TxReceiptSchema,
  TxTraceSchema,
  SignedTxSchema,
  WorkflowSchema,
  PolicySchema,
  NetworkProfileSchema,
  AssumptionSchema,
  MigrationReceiptSchema,
  TxSubmissionSchema,
  ReplayReportSchema,
  ARTIFACT_VERSION
} from "./schemas.js";
import { NetworkId, type CorruptionCode, type CorruptionSeverity } from "@hardkas/core";
import { verifyFeeSemantics } from "./feeVerify.js";
import { verifyLineage } from "./lineage.js";
import { checkArtifactIdentity, resolveArtifactSync, enumerateWorkspaceArtifactsSync } from "./resolve.js";
import {
  SilverCompileArtifactSchema,
  SilverDeployArtifactSchema,
  SilverDeployPlanArtifactSchema,
  SilverDeploySimulationArtifactSchema,
  SilverSpendReceiptArtifactSchema,
  SilverSpendSimulationArtifactSchema,
  SilverTestArtifactSchema,
  SilverSpendPlanArtifactSchema,
  SilverCompileV1Schema,
  SilverDeployV1Schema,
  SilverSpendV1Schema,
  SilverCovenantV1Schema
} from "./schemas.js";

export interface Clock {
  now(): number;
}

export const defaultClock: Clock = {
  now: () => Date.now() // hardkas-determinism-allow: default clock ambient source
};

export interface VerificationContext {
  clock?: Clock;
  strict?: boolean;
  networkId?: NetworkId;
  parent?: unknown;
  /** The workspace whose store resolves persisted references (IC-5′.7). */
  workspaceRoot?: string;
  /** Legacy locator of the store (`<workspaceRoot>/.hardkas/artifacts`); the root is derived from it. */
  artifactsDir?: string;
  enforceMetadata?: boolean;
  /** Optional override returning an already-verified artifact for a 64-hex artifactId, or null. */
  resolveArtifact?: (id: string) => any;
  visitedArtifacts?: Set<string>;
}

export type VerificationSeverity = CorruptionSeverity | "info" | "critical";

export type VerificationIssue = {
  code: CorruptionCode | string;
  severity: VerificationSeverity;
  message: string;
  path?: string | undefined;
  pathStr?: string | undefined; // For compatibility
  artifactId?: string | undefined;
};

/**
 * What the content hash actually authenticated (Closure Pack D-Q1.e / D-Q21):
 * - FULL: current hash version; every field outside the closed operational list.
 * - LEGACY: a version 1–4 artifact verified under its own rules; the fields in
 *   `unauthenticatedMaterialFields` were never covered. No decision path may act on them.
 * - NONE: integrity could not be established (invalid hashVersion, unreadable input).
 */
export type AuthScope = "FULL" | "LEGACY" | "NONE";

export type ArtifactVerificationResult = {
  ok: boolean;
  artifactType?: string;
  version?: string;
  expectedHash?: string;
  actualHash?: string;
  authScope: AuthScope;
  unauthenticatedMaterialFields: string[];
  errors: string[]; // Legacy support
  issues: VerificationIssue[];
};

/**
 * Deterministically compares two strings.
 */
function deterministicCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Sorts UTXOs deterministically by outpoint (transactionId:index).
 */
export function sortUtxosByOutpoint<T>(utxos: T[]): T[] {
  return [...utxos].sort((a, b) => {
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const aOutpoint = aRec.outpoint as
      | { transactionId?: string; index?: number }
      | undefined;
    const bOutpoint = bRec.outpoint as
      | { transactionId?: string; index?: number }
      | undefined;
    const aId =
      (aRec.id as string) ||
      (aOutpoint ? `${aOutpoint.transactionId}:${aOutpoint.index}` : "");
    const bId =
      (bRec.id as string) ||
      (bOutpoint ? `${bOutpoint.transactionId}:${bOutpoint.index}` : "");
    return deterministicCompare(aId, bId);
  });
}

/**
 * Verifies an artifact's integrity synchronously.
 * Can take a raw object or a file path.
 */
export function verifyArtifactIntegritySync(
  artifactOrPath: unknown,
  context: VerificationContext = {}
): ArtifactVerificationResult {
  const result: ArtifactVerificationResult = {
    ok: false,
    authScope: "NONE",
    unauthenticatedMaterialFields: [],
    errors: [],
    issues: []
  };

  const addError = (code: string, message: string, path?: string) => {
    result.errors.push(message);
    result.issues.push({ code, severity: "error", message, path });
  };

  let artifact: unknown;

  try {
    // 1. Resolve Artifact Source
    if (typeof artifactOrPath === "string") {
      if (!fs.existsSync(artifactOrPath)) {
        addError("FILE_NOT_FOUND", `File not found: ${artifactOrPath}`);
        return result;
      }
      let content = fs.readFileSync(artifactOrPath, "utf-8");
      if (content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
      }
      artifact = JSON.parse(content);
    } else {
      artifact = artifactOrPath;
    }

    const v = artifact as Record<string, unknown>;
    result.artifactType = v.schema as string;
    result.version = v.version as string;
    result.expectedHash = v.contentHash as string;

    // IC-4′.1 (AUD-08 / P6): no schema skips verification. The former
    // ReplayReportV1 early return is gone; a replay report is sealed by its
    // producer and verified like every other artifact.

    // 2. Basic Version & Schema Check
    if (!v.version || !v.schema) {
      addError(
        "ARTIFACT_SCHEMA_MISSING",
        "Missing version or schema (Artifact might be v1 or legacy)"
      );
      return result;
    }

    // Version Compatibility (reject if major version is different)
    const [currentMajor] = ARTIFACT_VERSION.split(".");
    const [artifactMajor] = (v.version as string).split(".");
    if (currentMajor !== artifactMajor) {
      addError(
        "ARTIFACT_SCHEMA_INVALID",
        `Incompatible version: current system is v${currentMajor}, artifact is v${artifactMajor}`
      );
      return result;
    }

    // 3. Hash version gate (IC-4′.2): an integer in range, declared by the artifact.
    //    Anything else fails closed in every mode; no reader falls back to v1.
    const hashVersion = readDeclaredHashVersion(v);
    if (hashVersion === null) {
      addError(
        "HASH_VERSION_INVALID",
        `hashVersion must be an integer between ${MIN_HASH_VERSION} and ${CURRENT_HASH_VERSION} declared by the artifact; got ${JSON.stringify(v.hashVersion)}`
      );
      return result;
    }

    // 4. Hash verification under the DECLARED version.
    const actualHash = calculateContentHash(v, hashVersion);
    result.actualHash = actualHash;

    if (!v.contentHash) {
      addError("MISSING_CONTENT_HASH", "Missing contentHash field");
    } else if (actualHash !== v.contentHash) {
      addError(
        "ARTIFACT_HASH_MISMATCH",
        `Hash mismatch: expected ${v.contentHash}, got ${actualHash}`
      );
    }

    // 5. Authentication scope (IC-4′.3–4, D-Q1.e). Strict requires the current
    //    version; non-strict verifies a legacy artifact under its own rules and
    //    names every material field that version never authenticated.
    if (hashVersion < CURRENT_HASH_VERSION) {
      result.authScope = "LEGACY";
      result.unauthenticatedMaterialFields = legacyUnauthenticatedMaterialFields(v, hashVersion);
      if (context.strict) {
        addError(
          "MIGRATION_REQUIRED",
          `Artifact declares hashVersion ${hashVersion}; strict verification requires ${CURRENT_HASH_VERSION}. Re-issue it with 'hardkas artifact migrate --to ${CURRENT_HASH_VERSION}'.`
        );
      } else {
        result.issues.push({
          code: "LEGACY_AUTH_SCOPE",
          severity: "info",
          message:
            `hashVersion ${hashVersion}: integrity verified under legacy rules; never authenticated: ` +
            (result.unauthenticatedMaterialFields.length ? result.unauthenticatedMaterialFields.join(", ") : "(none present)")
        });
      }
    } else {
      result.authScope = "FULL";
      // IC-4′.5: derived labels are outside the hash and must match the recomputed identity.
      if (v.schema === HardkasSchemas.TxPlan && v.planId !== undefined && v.planId !== `plan-${actualHash.slice(0, 16)}`) {
        addError("LABEL_MISMATCH", `planId ${String(v.planId)} does not derive from the artifact's content hash`);
      }
      if (v.schema === HardkasSchemas.SignedTx && v.signedId !== undefined && v.signedId !== `signed-${actualHash.slice(0, 16)}`) {
        addError("LABEL_MISMATCH", `signedId ${String(v.signedId)} does not derive from the artifact's content hash`);
      }
      // IC-7.3 / IC-4′.5: a version-5 artifact stores no top-level identity copy.
      // The identity is the recomputed contentHash; a stored `artifactId` is either
      // redundant or a label posing as an identity (P7 / AUD-10).
      if (v.artifactId !== undefined) {
        addError(
          "FORBIDDEN_IDENTITY_FIELD",
          `hashVersion ${CURRENT_HASH_VERSION} artifacts must not carry a top-level artifactId (got ${JSON.stringify(v.artifactId)}); the identity is the recomputed contentHash`
        );
      }
    }

    // 4. Zod Schema Validation
    let schema;
    switch (v.schema) {
      case HardkasSchemas.Snapshot:
      case HardkasSchemas.SnapshotV1:
        schema = SnapshotSchema;
        break;
      case HardkasSchemas.TxPlan:
        schema = TxPlanSchema;
        break;
      case HardkasSchemas.TxReceipt:
        schema = TxReceiptSchema;
        break;
      case HardkasSchemas.TxTrace:
        schema = TxTraceSchema;
        break;
      case HardkasSchemas.SignedTx:
        schema = SignedTxSchema;
        break;
      case HardkasSchemas.WorkflowV1:
        schema = WorkflowSchema;
        break;
      case HardkasSchemas.PolicyV1:
        schema = PolicySchema;
        break;
      case HardkasSchemas.NetworkProfileV1:
        schema = NetworkProfileSchema;
        break;
      case HardkasSchemas.AssumptionV1:
        schema = AssumptionSchema;
        break;
      case HardkasSchemas.MigrationReceiptV1:
        schema = MigrationReceiptSchema;
        break;
      case HardkasSchemas.TxSubmissionV1:
        schema = TxSubmissionSchema;
        break;
      case HardkasSchemas.ReplayReportV1:
        schema = ReplayReportSchema;
        break;
      case HardkasSchemas.SilverCompile:
        schema = SilverCompileArtifactSchema;
        break;
      case HardkasSchemas.SilverDeployPlan:
        schema = SilverDeployPlanArtifactSchema;
        break;
      case HardkasSchemas.SilverDeploy:
        schema = SilverDeployArtifactSchema;
        break;
      case HardkasSchemas.SilverTest:
        schema = SilverTestArtifactSchema;
        break;
      case HardkasSchemas.SilverSpendPlan:
        schema = SilverSpendPlanArtifactSchema;
        break;
      case HardkasSchemas.SilverSpendReceipt:
        schema = SilverSpendReceiptArtifactSchema;
        break;
      case HardkasSchemas.SilverDeploySimulation:
        schema = SilverDeploySimulationArtifactSchema;
        break;
      case HardkasSchemas.SilverSpendSimulation:
        schema = SilverSpendSimulationArtifactSchema;
        break;
      case HardkasSchemas.SilverCompileV1:
        schema = SilverCompileV1Schema;
        break;
      case HardkasSchemas.SilverDeployV1:
        schema = SilverDeployV1Schema;
        break;
      case HardkasSchemas.SilverSpendV1:
        schema = SilverSpendV1Schema;
        break;
      case HardkasSchemas.SilverCovenantV1:
        schema = SilverCovenantV1Schema;
        break;
    }

    if (schema) {
      const validation = schema.safeParse(v);
      if (!validation.success) {
        // Pre-existing rule, unchanged by Wave 1.1: hashVersion 1–3 verified in
        // non-strict mode report schema mismatches as warnings. It is NOT widened to
        // v4 (authScope LEGACY): that would let mutated rc.22 artifacts pass as valid.
        const zodSeverity: VerificationSeverity =
          hashVersion < 4 && !context.strict ? "warning" : "error";
        validation.error.issues.forEach((e) => {
          const pathStr = e.path.join(".");
          if (zodSeverity === "warning") {
            result.issues.push({
              code: "ARTIFACT_SCHEMA_INVALID" as CorruptionCode,
              severity: zodSeverity,
              message: `${pathStr}: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`,
              ...(pathStr ? { path: pathStr } : {})
            });
          } else {
            addError("ARTIFACT_SCHEMA_INVALID", `${pathStr}: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`, pathStr);
          }
        });
      }
    } else {
      addError(
        "ARTIFACT_SCHEMA_INVALID",
        `Unsupported or unknown artifact schema: ${v.schema}`
      );
    }

    result.ok = result.issues.every(
      (i) => i.severity !== "error" && i.severity !== "critical"
    );
    return result;
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      addError("ARTIFACT_JSON_INVALID", `Invalid JSON: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`);
    } else if (e instanceof Error) {
      addError("ARTIFACT_ID_INVALID", `Unexpected verification error: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`);
    } else {
      addError("ARTIFACT_ID_INVALID", `Unexpected verification error: ${String(e)}`);
    }
    return result;
  }
}

/**
 * Verifies an artifact's integrity asynchronously.
 * Can take a raw object or a file path.
 */
export async function verifyArtifactIntegrity(
  artifactOrPath: unknown,
  context: VerificationContext = {}
): Promise<ArtifactVerificationResult> {
  return verifyArtifactIntegritySync(artifactOrPath, context);
}

/**
 * A FULL-scope MigrationReceipt in the store that certifies `artifact` as the
 * re-issue of `parentId` (D-Q1.f), or `artifact` itself when it is that receipt.
 */
function findMigrationCertificate(
  workspaceRoot: string,
  artifact: Record<string, unknown>,
  parentId: string
): { kind: "self" | "receipt"; receiptId: string } | undefined {
  const own = checkArtifactIdentity(artifact);
  if (!own.ok || own.authScope !== "FULL") return undefined;
  if (artifact.schema === HardkasSchemas.MigrationReceiptV1 && artifact.oldHash === parentId) {
    return { kind: "self", receiptId: own.artifactId };
  }
  let entries: ReturnType<typeof enumerateWorkspaceArtifactsSync>;
  try {
    entries = enumerateWorkspaceArtifactsSync(workspaceRoot);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const a: any = entry.artifact;
    if (a?.schema !== HardkasSchemas.MigrationReceiptV1) continue;
    if (a.oldHash !== parentId || a.newHash !== own.artifactId) continue;
    const check = checkArtifactIdentity(a);
    if (check.ok && check.authScope === "FULL") return { kind: "receipt", receiptId: check.artifactId };
  }
  return undefined;
}

/**
 * Verifies an artifact's semantic and economic validity.
 */
export function verifyArtifactSemantics(
  artifact: unknown,
  context: VerificationContext = {}
): ArtifactVerificationResult {
  const result: ArtifactVerificationResult = {
    ok: true,
    authScope: "NONE", // semantics do not establish integrity; see verifyArtifactIntegritySync
    unauthenticatedMaterialFields: [],
    errors: [],
    issues: []
  };

  const clock = context.clock || defaultClock;
  const strict = context.strict || false;

  const addIssue = (issue: VerificationIssue) => {
    if (issue.severity === "error" || issue.severity === "critical") result.ok = false;
    result.issues.push(issue);
    if (issue.severity === "error" || issue.severity === "critical")
      result.errors.push(issue.message);
  };

  const visitedArtifacts = context.visitedArtifacts || new Set<string>();
  const v = artifact as Record<string, unknown>;
  const currentId = (v.contentHash || v.artifactId || v.planId || v.signedId || v.txId) as string;

  if (currentId) {
    if (visitedArtifacts.has(currentId)) {
      addIssue({
        code: "CIRCULAR_LINEAGE_DETECTED",
        severity: "error",
        message: `Circular lineage detected: artifact ${currentId} was already visited`
      });
      return result;
    }
    visitedArtifacts.add(currentId);
  }

  // 1. Fee & Economic Audit
  const feeAudit = verifyFeeSemantics(artifact);
  if (!feeAudit.ok) {
    feeAudit.issues.forEach((msg) => {
      addIssue({
        code: "ECONOMIC_VIOLATION",
        severity: strict ? "error" : "warning",
        message: msg
      });
    });
  }


  // Strict Reference and Policy Evaluation (HardKAS v0.8.4)
  //
  // Wave 1.2 · Closure Pack IC-5′.6–.7: persisted references (policyRefs,
  // networkProfileRef, assumptionRef, lineage.parentArtifactId) are authenticated
  // artifactIds. They resolve ONLY by verified identity inside the workspace store:
  // never relative to process.cwd() (AUX-02), never through a top-level
  // `artifactId` (AUD-10 / P7), never by a label, txId or file name.
  let parentObj: any = null;

  if (strict) {
    const workspaceRoot =
      context.workspaceRoot ??
      (context.artifactsDir ? path.resolve(context.artifactsDir, "..", "..") : undefined);

    type ReferenceOutcome = { obj: any } | { issue: VerificationIssue };
    const resolveReference = (ref: unknown, kind: string): ReferenceOutcome => {
      if (typeof ref !== "string" || !/^[0-9a-f]{64}$/.test(ref)) {
        return {
          issue: {
            code: "REFERENCE_INVALID",
            severity: "error",
            message: `Referenced ${kind} ${String(ref)} is not a 64-hex artifactId; a persisted reference is never a label, txId or path`
          }
        };
      }
      const fromContext = context.resolveArtifact ? context.resolveArtifact(ref) : null;
      if (fromContext) return { obj: fromContext };
      if (!workspaceRoot) {
        return {
          issue: {
            code: "REFERENCE_MISSING",
            severity: "error",
            message: `Referenced ${kind} ${ref} cannot be resolved: no workspace root was given`
          }
        };
      }
      try {
        return { obj: resolveArtifactSync(workspaceRoot, { artifact: ref }).artifact };
      } catch (e: any) {
        // CANDIDATE_INVALID: a stored copy claims the referenced identity but does not
        // hash to it — the reference's content does not match its hash.
        const code =
          e?.code === "ARTIFACT_NOT_FOUND"
            ? "REFERENCE_MISSING"
            : e?.code === "REFERENCE_AMBIGUOUS"
              ? "REFERENCE_AMBIGUOUS"
              : e?.code === "CANDIDATE_INVALID"
                ? "REFERENCE_HASH_MISMATCH"
                : "REFERENCE_CORRUPT";
        return {
          issue: { code, severity: "error", message: `Referenced ${kind} ${ref}: ${e?.message ?? String(e)}` }
        };
      }
    };

    // The target is verified again under the caller's context and must BE the referenced identity.
    const checkReference = (ref: string, kind: string, refObj: any): boolean => {
      const integrity = verifyArtifactIntegritySync(refObj, context);
      if (!integrity.ok) {
        addIssue({
          code: "REFERENCE_HASH_MISMATCH",
          severity: "error",
          message: `Referenced ${kind} ${ref} integrity check failed: ${integrity.errors.join(", ")}`
        });
        return false;
      }
      if (integrity.actualHash !== ref) {
        addIssue({
          code: "REFERENCE_HASH_MISMATCH",
          severity: "error",
          message: `${kind} reference mismatch: expected ${ref}, got ${integrity.actualHash}`
        });
        return false;
      }
      return true;
    };

    // Collect policy references
    const policyRefs: unknown[] = [];
    if (Array.isArray(v.policyRefs)) {
      policyRefs.push(...v.policyRefs);
    } else if (typeof v.policyRef === "string") {
      policyRefs.push(v.policyRef);
    }

    // Resolve policies
    for (const ref of policyRefs) {
      const outcome = resolveReference(ref, "policy");
      if ("issue" in outcome) {
        addIssue(outcome.issue);
        continue;
      }
      const refObj = outcome.obj;
      try {
        if (!checkReference(ref as string, "policy", refObj)) continue;
        // 2. Minimal Policy Evaluation
        if (refObj.schema === HardkasSchemas.PolicyV1) {
          if (refObj.decision === "DENY") {
            addIssue({
              code: "POLICY_VIOLATION",
              severity: "error",
              message: `Policy evaluation rejected: decision is DENY`
            });
          } else if (refObj.decision !== "ALLOW") {
            addIssue({
              code: "POLICY_VIOLATION",
              severity: "error",
              message: `Policy evaluation rejected: decision is invalid (${refObj.decision})`
            });
          }
          const failedRules =
            refObj.rules?.filter((r: any) => r.result === "FAIL") || [];
          if (failedRules.length > 0) {
            addIssue({
              code: "POLICY_VIOLATION",
              severity: "error",
              message: `Policy rules failed: ${failedRules.map((r: any) => r.id).join(", ")}`
            });
          }
        }
      } catch (e: unknown) {
        addIssue({
          code: "REFERENCE_CORRUPT",
          severity: "error",
          message: `Failed to read/verify policy ${String(ref)}: ${(e as Error).message}`
        });
      }
    }

    // Resolve networkProfileRef / assumptionRef
    for (const [field, kind] of [
      ["networkProfileRef", "network profile"],
      ["assumptionRef", "assumption"]
    ] as const) {
      const ref = v[field];
      if (ref === undefined || ref === null) continue;
      const outcome = resolveReference(ref, kind);
      if ("issue" in outcome) {
        addIssue(outcome.issue);
        continue;
      }
      try {
        checkReference(ref as string, kind, outcome.obj);
      } catch (e: unknown) {
        addIssue({
          code: "REFERENCE_CORRUPT",
          severity: "error",
          message: `Failed to verify ${kind} ${String(ref)}`
        });
      }
    }

    // Resolve the parent for the active lineage check: only the authenticated
    // lineage.parentArtifactId; sourcePlanId / sourceSignedId are labels and never resolve.
    const lineage = v.lineage as any;
    const parentId =
      typeof lineage?.parentArtifactId === "string" &&
      lineage.parentArtifactId.length > 0 &&
      lineage.parentArtifactId !== lineage.artifactId
        ? (lineage.parentArtifactId as string)
        : undefined;

    if (parentId) {
      // An explicit parent object is accepted only if it IS the referenced identity
      // (recomputed under its declared version); otherwise the store is consulted.
      let outcome: ReferenceOutcome | undefined;
      if (context.parent && typeof context.parent === "object") {
        const explicit = checkArtifactIdentity(context.parent);
        if (explicit.ok && explicit.artifactId === parentId) outcome = { obj: context.parent };
      }
      if (!outcome) outcome = resolveReference(parentId, "parent");
      if ("issue" in outcome) {
        if (outcome.issue.code === "REFERENCE_MISSING") {
          // D-Q1.f: a re-issued (migrated) artifact hangs from its legacy source,
          // which need not stay in the store. The absence is tolerated ONLY when a
          // FULL-scope MigrationReceipt in the store certifies exactly this link
          // (oldHash = the parent, newHash = this artifact), or when THIS artifact
          // is that receipt. Anything else is a missing parent.
          const certificate = workspaceRoot ? findMigrationCertificate(workspaceRoot, v, parentId) : undefined;
          if (certificate) {
            addIssue({
              code: certificate.kind === "self" ? "MIGRATION_SOURCE_ABSENT" : "PARENT_MIGRATED",
              severity: "info",
              message:
                certificate.kind === "self"
                  ? `Migration source ${parentId} is not in the workspace; this receipt certifies its re-issue as ${String(v.newHash)}`
                  : `Parent ${parentId} is not in the workspace; migration receipt ${certificate.receiptId} certifies this artifact as its re-issue`
            });
          } else {
            addIssue({
              code: "PARENT_MISSING",
              severity: strict ? "error" : "warning",
              message: `Parent artifact ${parentId} not found in workspace`
            });
          }
        } else {
          addIssue({ code: "PARENT_CORRUPT", severity: "error", message: outcome.issue.message });
        }
      } else {
        parentObj = outcome.obj;
        try {
          // Recursively verify parent semantic checks. The explicit `parent` hint
          // belongs to THIS artifact only; the parent's own parent resolves from the store.
          const { parent: _explicitParent, ...inherited } = context;
          const parentSem = verifyArtifactSemantics(parentObj, {
            ...inherited,
            strict: true,
            visitedArtifacts: new Set(visitedArtifacts)
          });
          if (!parentSem.ok) {
            parentSem.issues.forEach((issue) => addIssue(issue));
          }
        } catch (e: unknown) {
          addIssue({
            code: "PARENT_CORRUPT",
            severity: "error",
            message: `Failed to verify parent ${parentId}: ${(e as Error).message}`
          });
        }
      }
    }
  }

  // 1b. R-iii part 1 (IC-2′.2 / IC-5′.6): a submission's authenticated reference to
  // the signed artifact IS its lineage parent; the two must name one identity.
  if (v.schema === HardkasSchemas.TxSubmissionV1) {
    const lineageParent = (v.lineage as any)?.parentArtifactId;
    if (typeof v.signedArtifactId !== "string" || !/^[0-9a-f]{64}$/.test(v.signedArtifactId)) {
      addIssue({
        code: "SUBMISSION_REFERENCE_INVALID",
        severity: "error",
        message: `signedArtifactId must be the signed artifact's 64-hex artifactId (got ${JSON.stringify(v.signedArtifactId)})`
      });
    } else if (lineageParent !== v.signedArtifactId) {
      addIssue({
        code: "SUBMISSION_REFERENCE_MISMATCH",
        severity: "error",
        message: `signedArtifactId ${v.signedArtifactId} differs from lineage.parentArtifactId ${String(lineageParent)}`
      });
    }
    for (const forbidden of ["status", "confirmedAt", "dagContext", "acceptingBlockHash", "confirmations", "endpoint"]) {
      if (v[forbidden] !== undefined) {
        addIssue({
          code: "SUBMISSION_STATE_FORBIDDEN",
          severity: "error",
          message: `A submission records what HardKAS did; post-send state field "${forbidden}" belongs to an observation (IC-2′.2)`
        });
      }
    }
  }

  // 2. Staleness Check
  if (v.createdAt && typeof v.createdAt === "string" && !process.env.HARDKAS_TEST_IGNORE_STALENESS) {
    const created = new Date(v.createdAt).getTime();
    const now = clock.now();
    const ageHours = (now - created) / (1000 * 60 * 60);

    if (ageHours > 24 * 30) {
      addIssue({
        code: "STALE_ARTIFACT",
        severity: "error",
        message: `Artifact is too old (${Math.round(ageHours / 24)} days). High risk of DAA divergence.`
      });
    } else if (ageHours > 24) {
      addIssue({
        code: "STALE_ARTIFACT",
        severity: "warning",
        message: `Artifact is over 24h old. May be stale.`
      });
    }
  }

  // 3. Lineage Audit (Harden and Harmonize)
  const isSnapshot = v.schema === HardkasSchemas.Snapshot || v.schema === HardkasSchemas.SnapshotV1;
  const lineageAudit = verifyLineage(v, parentObj || context.parent, { strict });
  if (!lineageAudit.ok || (strict && !v.lineage && v.schema !== HardkasSchemas.WorkflowV1 && !isSnapshot)) {
    lineageAudit.issues.forEach((issue) => {
      addIssue(issue);
    });
  }

  // 4. Hardening Fields. A MigrationReceipt certifies a re-issue: it carries no
  //    workflow correlation or assumption level of its own (D-Q1.f).
  const isMigrationReceipt = v.schema === HardkasSchemas.MigrationReceiptV1;
  if (strict) {
    const enforceMetadata = context.enforceMetadata ?? true;
    if (enforceMetadata) {
      if (!v.workflowId && !isSnapshot && !isMigrationReceipt)
        addIssue({
          code: "MISSING_WORKFLOW_ID",
          severity: "error",
          message: "Strict mode requires workflowId"
        });
      if (!v.assumptionLevel && v.schema !== HardkasSchemas.WorkflowV1 && !isSnapshot && !isMigrationReceipt)
        addIssue({
          code: "MISSING_ASSUMPTION_LEVEL",
          severity: "error",
          message: "Strict mode requires assumptionLevel"
        });
      if (!v.executionMode && !v.mode)
        addIssue({
          code: "MISSING_EXECUTION_MODE",
          severity: "error",
          message: "Strict mode requires executionMode"
        });
    } else {
      if (!v.workflowId && !isSnapshot && !isMigrationReceipt)
        addIssue({
          code: "MISSING_WORKFLOW_ID",
          severity: "warning",
          message: "Missing workflowId"
        });
      if (!v.assumptionLevel && v.schema !== HardkasSchemas.WorkflowV1 && !isSnapshot && !isMigrationReceipt)
        addIssue({
          code: "MISSING_ASSUMPTION_LEVEL",
          severity: "warning",
          message: "Missing assumptionLevel"
        });
    }
  } else {
    if (!v.workflowId && !isSnapshot && !isMigrationReceipt)
      addIssue({
        code: "MISSING_WORKFLOW_ID",
        severity: "warning",
        message: "Missing workflowId"
      });
    if (!v.assumptionLevel && v.schema !== HardkasSchemas.WorkflowV1 && !isSnapshot && !isMigrationReceipt)
      addIssue({
        code: "MISSING_ASSUMPTION_LEVEL",
        severity: "warning",
        message: "Missing assumptionLevel"
      });
    if (!v.executionMode && !v.mode)
      addIssue({
        code: "MISSING_EXECUTION_MODE",
        severity: "warning",
        message: "Missing executionMode"
      });
  }

  // 5. Network vs Address prefix check
  const networkId = context.networkId || (v.networkId as NetworkId);
  const networkIdStr = networkId as string;

  if (networkId && (v.from || v.to)) {
    const from = v.from as Record<string, unknown>;
    const to = v.to as Record<string, unknown>;
    const addr = from?.address || to?.address;
    if (addr && typeof addr === "string") {
      let mismatch = false;
      if (networkIdStr === "mainnet") {
        mismatch =
          !addr.startsWith("kaspa:") ||
          addr.startsWith("kaspasim:") ||
          addr.startsWith("kaspa:sim_");
      } else if (networkIdStr.startsWith("testnet")) {
        mismatch = !addr.startsWith("kaspatest:");
      } else {
        mismatch = !addr.startsWith("kaspasim:") && !addr.startsWith("kaspa:sim_");
      }

      if (mismatch) {
        addIssue({
          code: "NETWORK_ADDRESS_MISMATCH",
          severity: "error",
          message: `Network/Address mismatch: network is ${networkId} but address is ${addr}`
        });
      }
    }
  }

  return result;
}

/**
 * Verifies an artifact's replay consistency.
 * Honest implementation: reports as unsupported or not implemented.
 */
export async function verifyArtifactReplay(
  _artifact: unknown,
  _context: VerificationContext = {}
): Promise<ArtifactVerificationResult> {
  return {
    ok: false,
    authScope: "NONE",
    unauthenticatedMaterialFields: [],
    issues: [
      {
        code: "REPLAY_UNSUPPORTED_CHECK",
        severity: "warning",
        message:
          "Replay verification (full consensus simulation) is currently unsupported in this build."
      }
    ],
    errors: ["Replay verification (consensus) unsupported"]
  };
}

/**
 * @deprecated Use verifyArtifactIntegrity instead.
 */
export const verifyArtifact = verifyArtifactIntegrity;
export const verifyArtifactFile = verifyArtifactIntegrity;
