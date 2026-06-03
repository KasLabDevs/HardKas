import fs from "node:fs";
import path from "node:path";
import { calculateContentHash } from "./canonical.js";
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
  ARTIFACT_VERSION
} from "./schemas.js";
import { NetworkId, type CorruptionCode, type CorruptionSeverity } from "@hardkas/core";
import { verifyFeeSemantics } from "./feeVerify.js";
import { verifyLineage } from "./lineage.js";

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
  artifactsDir?: string;
  enforceMetadata?: boolean;
  resolveArtifact?: (id: string) => any;
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

export type ArtifactVerificationResult = {
  ok: boolean;
  artifactType?: string;
  version?: string;
  expectedHash?: string;
  actualHash?: string;
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
  artifactOrPath: unknown
): ArtifactVerificationResult {
  const result: ArtifactVerificationResult = {
    ok: false,
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

    if (v.schema === "hardkas.replayReport.v1") {
      result.ok = true;
      return result;
    }

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

    // 3. Hash Verification
    const hashVersion = (v.hashVersion as number) || 1;
    const actualHash = calculateContentHash(v, hashVersion);
    result.actualHash = actualHash;

    if (!v.contentHash) {
      addError("MISSING_CONTENT_HASH", "Missing contentHash field");
    } else if (actualHash !== v.contentHash) {
      addError(
        "HASH_MISMATCH",
        `Hash mismatch: expected ${v.contentHash}, got ${actualHash}`
      );
    }

    // 4. Zod Schema Validation
    let schema;
    switch (v.schema) {
      case "hardkas.snapshot":
        schema = SnapshotSchema;
        break;
      case "hardkas.txPlan":
        schema = TxPlanSchema;
        break;
      case "hardkas.txReceipt":
        schema = TxReceiptSchema;
        break;
      case "hardkas.txTrace":
        schema = TxTraceSchema;
        break;
      case "hardkas.signedTx":
        schema = SignedTxSchema;
        break;
      case "hardkas.workflow.v1":
        schema = WorkflowSchema;
        break;
      case "hardkas.policy.v1":
        schema = PolicySchema;
        break;
      case "hardkas.networkProfile.v1":
        schema = NetworkProfileSchema;
        break;
      case "hardkas.assumption.v1":
        schema = AssumptionSchema;
        break;
      case "hardkas.migrationReceipt.v1":
        schema = MigrationReceiptSchema;
        break;
    }

    if (schema) {
      const validation = schema.safeParse(v);
      if (!validation.success) {
        validation.error.issues.forEach((e) => {
          const pathStr = e.path.join(".");
          addError("ARTIFACT_SCHEMA_INVALID", `${pathStr}: ${e.message}`, pathStr);
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
      addError("ARTIFACT_JSON_INVALID", `Invalid JSON: ${e.message}`);
    } else if (e instanceof Error) {
      addError("ARTIFACT_ID_INVALID", `Unexpected verification error: ${e.message}`);
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
  artifactOrPath: unknown
): Promise<ArtifactVerificationResult> {
  return verifyArtifactIntegritySync(artifactOrPath);
}

function findFileByHash(hash: string, dirs: string[]): string | null {
  const shortHash = hash.startsWith("plan-") || hash.startsWith("signed-") ? hash : hash.slice(0, 16);
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      if (files.includes(`${hash}.json`)) {
        return path.join(dir, `${hash}.json`);
      }
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        if (
          file.includes(hash) ||
          file.includes(shortHash) ||
          file.includes(hash.slice(0, 8))
        ) {
          const filePath = path.join(dir, file);
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            const obj = JSON.parse(content);
            if (
              obj.contentHash === hash ||
              obj.artifactId === hash ||
              obj.planId === hash ||
              obj.signedId === hash ||
              obj.txId === hash
            ) {
              return filePath;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
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

  const v = artifact as Record<string, unknown>;

  // Strict Reference and Policy Evaluation (HardKAS v0.8.4)
  let parentObj: any = null;

  if (strict) {
    const searchDirs = [];
    if (context.artifactsDir) {
      searchDirs.push(context.artifactsDir);
    }
    searchDirs.push(path.join(process.cwd(), ".hardkas", "artifacts"));
    searchDirs.push(path.join(process.cwd(), "artifacts"));

    // Collect policy references
    const policyRefs: string[] = [];
    if (Array.isArray(v.policyRefs)) {
      policyRefs.push(...v.policyRefs);
    } else if (typeof v.policyRef === "string") {
      policyRefs.push(v.policyRef);
    }



    // Resolve policies
    for (const ref of policyRefs) {
      let refObj = context.resolveArtifact ? context.resolveArtifact(ref) : null;
      if (!refObj) {
        const refFile = findFileByHash(ref, searchDirs);
        if (refFile) {
          try {
            const content = fs.readFileSync(refFile, "utf-8");
            refObj = JSON.parse(content);
          } catch (e: any) {
            addIssue({
              code: "REFERENCE_CORRUPT",
              severity: "error",
              message: `Failed to read policy ${ref}: ${e.message}`
            });
          }
        }
      }

      if (!refObj) {
        addIssue({
          code: "REFERENCE_MISSING",
          severity: "error",
          message: `Referenced policy artifact ${ref} not found in workspace`
        });
      } else {
        try {
          // 1. Verify policy integrity
          const integrity = verifyArtifactIntegritySync(refObj);
          if (!integrity.ok) {
            addIssue({
              code: "REFERENCE_HASH_MISMATCH",
              severity: "error",
              message: `Referenced policy ${ref} integrity check failed: ${integrity.errors.join(", ")}`
            });
          } else if (refObj.contentHash !== ref && refObj.artifactId !== ref) {
            addIssue({
              code: "REFERENCE_HASH_MISMATCH",
              severity: "error",
              message: `Policy reference mismatch: expected ${ref}, got ${refObj.contentHash}`
            });
          } else {
            // 2. Minimal Policy Evaluation
            if (refObj.schema === "hardkas.policy.v1") {
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
              const failedRules = refObj.rules?.filter((r: any) => r.result === "FAIL") || [];
              if (failedRules.length > 0) {
                addIssue({
                  code: "POLICY_VIOLATION",
                  severity: "error",
                  message: `Policy rules failed: ${failedRules.map((r: any) => r.id).join(", ")}`
                });
              }
            }
          }
        } catch (e: any) {
          addIssue({
            code: "REFERENCE_CORRUPT",
            severity: "error",
            message: `Failed to read/verify policy ${ref}: ${e.message}`
          });
        }
      }
    }

    // Resolve networkProfileRef
    if (typeof v.networkProfileRef === "string") {
      const ref = v.networkProfileRef;
      let refObj = context.resolveArtifact ? context.resolveArtifact(ref) : null;
      if (!refObj) {
        const refFile = findFileByHash(ref, searchDirs);
        if (refFile) {
          try {
            refObj = JSON.parse(fs.readFileSync(refFile, "utf-8"));
          } catch {}
        }
      }
      if (!refObj) {
        addIssue({
          code: "REFERENCE_MISSING",
          severity: "error",
          message: `Referenced network profile ${ref} not found in workspace`
        });
      } else {
        try {
          const integrity = verifyArtifactIntegritySync(refObj);
          if (!integrity.ok) {
            addIssue({
              code: "REFERENCE_HASH_MISMATCH",
              severity: "error",
              message: `Referenced profile ${ref} integrity check failed`
            });
          } else if (refObj.contentHash !== ref && refObj.artifactId !== ref) {
            addIssue({
              code: "REFERENCE_HASH_MISMATCH",
              severity: "error",
              message: `Profile reference mismatch: expected ${ref}, got ${refObj.contentHash}`
            });
          }
        } catch (e: any) {
          addIssue({
            code: "REFERENCE_CORRUPT",
            severity: "error",
            message: `Failed to verify profile ${ref}`
          });
        }
      }
    }

    // Resolve assumptionRef
    if (typeof v.assumptionRef === "string") {
      const ref = v.assumptionRef;
      let refObj = context.resolveArtifact ? context.resolveArtifact(ref) : null;
      if (!refObj) {
        const refFile = findFileByHash(ref, searchDirs);
        if (refFile) {
          try {
            refObj = JSON.parse(fs.readFileSync(refFile, "utf-8"));
          } catch {}
        }
      }
      if (!refObj) {
        addIssue({
          code: "REFERENCE_MISSING",
          severity: "error",
          message: `Referenced assumption ${ref} not found in workspace`
        });
      } else {
        try {
          const integrity = verifyArtifactIntegritySync(refObj);
          if (!integrity.ok) {
            addIssue({
              code: "REFERENCE_HASH_MISMATCH",
              severity: "error",
              message: `Referenced assumption ${ref} integrity check failed`
            });
          } else if (refObj.contentHash !== ref && refObj.artifactId !== ref) {
            addIssue({
              code: "REFERENCE_HASH_MISMATCH",
              severity: "error",
              message: `Assumption reference mismatch: expected ${ref}, got ${refObj.contentHash}`
            });
          }
        } catch (e: any) {
          addIssue({
            code: "REFERENCE_CORRUPT",
            severity: "error",
            message: `Failed to verify assumption ${ref}`
          });
        }
      }
    }

    // Resolve parent artifact for active lineage check
    let parentId: string | undefined;
    const lineage = v.lineage as any;
    if (lineage?.parentArtifactId && lineage?.parentArtifactId !== lineage?.artifactId) {
      parentId = lineage?.parentArtifactId as string;
    } else if (v.schema === "hardkas.signedTx") {
      parentId = v.sourcePlanId as string;
    } else if (v.schema === "hardkas.txReceipt") {
      parentId = (v.sourceSignedId || lineage?.parentArtifactId) as string;
    }

    if (parentId) {
      parentObj = context.resolveArtifact ? context.resolveArtifact(parentId) : null;
      if (!parentObj) {
        const parentFile = findFileByHash(parentId, searchDirs);
        if (parentFile) {
          try {
            parentObj = JSON.parse(fs.readFileSync(parentFile, "utf-8"));
          } catch (e: any) {
            addIssue({
              code: "PARENT_CORRUPT",
              severity: "error",
              message: `Failed to read parent ${parentId}: ${e.message}`
            });
          }
        }
      }

      if (!parentObj) {
        addIssue({
          code: "PARENT_MISSING",
          severity: "warning",
          message: `Parent artifact ${parentId} not found in workspace`
        });
      } else {
        try {
          // Recursively verify parent semantic checks
          const parentSem = verifyArtifactSemantics(parentObj, { ...context, strict: true });
          if (!parentSem.ok) {
            parentSem.issues.forEach(issue => addIssue(issue));
          }
        } catch (e: any) {
          addIssue({
            code: "PARENT_CORRUPT",
            severity: "error",
            message: `Failed to verify parent ${parentId}: ${e.message}`
          });
        }
      }
    }
  }

  // 2. Staleness Check
  if (v.createdAt && typeof v.createdAt === "string") {
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
  const lineageAudit = verifyLineage(v, parentObj || context.parent, { strict });
  if (!lineageAudit.ok || (strict && !v.lineage && v.schema !== "hardkas.workflow.v1")) {
    lineageAudit.issues.forEach((issue) => {
      addIssue(issue);
    });
  }

  // 4. Hardening Fields
  if (strict) {
    const enforceMetadata = context.enforceMetadata ?? true;
    if (enforceMetadata) {
      if (!v.workflowId)
        addIssue({
          code: "MISSING_WORKFLOW_ID",
          severity: "error",
          message: "Strict mode requires workflowId"
        });
      if (!v.assumptionLevel && v.schema !== "hardkas.workflow.v1")
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
      if (!v.workflowId)
        addIssue({
          code: "MISSING_WORKFLOW_ID",
          severity: "warning",
          message: "Missing workflowId"
        });
      if (!v.assumptionLevel && v.schema !== "hardkas.workflow.v1")
        addIssue({
          code: "MISSING_ASSUMPTION_LEVEL",
          severity: "warning",
          message: "Missing assumptionLevel"
        });
    }
  } else {
    if (!v.workflowId)
      addIssue({
        code: "MISSING_WORKFLOW_ID",
        severity: "warning",
        message: "Missing workflowId"
      });
    if (!v.assumptionLevel && v.schema !== "hardkas.workflow.v1")
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
        mismatch = !addr.startsWith("kaspa:") || addr.startsWith("kaspa:sim_");
      } else if (networkIdStr.startsWith("testnet")) {
        mismatch = !addr.startsWith("kaspatest:");
      } else {
        mismatch = !addr.startsWith("kaspa:sim_");
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
  artifact: unknown,
  _context: VerificationContext = {}
): Promise<ArtifactVerificationResult> {
  return {
    ok: false,
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
