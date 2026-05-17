import fs from "node:fs";
import { calculateContentHash } from "./canonical.js";
import { 
  SnapshotSchema, 
  TxPlanSchema, 
  TxReceiptSchema, 
  TxTraceSchema,
  SignedTxSchema,
  ARTIFACT_VERSION
} from "./schemas.js";
import { NetworkId, type CorruptionCode, type CorruptionSeverity } from "@hardkas/core";
import { verifyFeeSemantics } from "./feeVerify.js";
import { verifyLineage } from "./lineage.js";

export interface Clock {
  now(): number;
}

export const defaultClock: Clock = {
  now: () => Date.now()
};

export interface VerificationContext {
  clock?: Clock;
  strict?: boolean;
  networkId?: NetworkId;
  parent?: unknown;
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
 * Sorts UTXOs deterministically by outpoint (transactionId:index).
 */
export function sortUtxosByOutpoint<T>(utxos: T[]): T[] {
  return [...utxos].sort((a: any, b: any) => {
    const aId = a.id || (a.outpoint ? `${a.outpoint.transactionId}:${a.outpoint.index}` : "");
    const bId = b.id || (b.outpoint ? `${b.outpoint.transactionId}:${b.outpoint.index}` : "");
    return aId.localeCompare(bId);
  });
}

/**
 * Verifies an artifact's integrity.
 * Can take a raw object or a file path.
 */
export async function verifyArtifactIntegrity(artifactOrPath: unknown): Promise<ArtifactVerificationResult> {
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
      const content = fs.readFileSync(artifactOrPath, "utf-8");
      artifact = JSON.parse(content);
    } else {
      artifact = artifactOrPath;
    }

    const v = artifact as Record<string, unknown>;
    result.artifactType = v.schema as string;
    result.version = v.version as string;
    result.expectedHash = v.contentHash as string;

    // 2. Basic Version & Schema Check
    if (!v.version || !v.schema) {
      addError("ARTIFACT_SCHEMA_MISSING", "Missing version or schema (Artifact might be v1 or legacy)");
      return result;
    }

    // Version Compatibility (reject if major version is different)
    const [currentMajor] = ARTIFACT_VERSION.split(".");
    const [artifactMajor] = (v.version as string).split(".");
    if (currentMajor !== artifactMajor) {
      addError("ARTIFACT_SCHEMA_INVALID", `Incompatible version: current system is v${currentMajor}, artifact is v${artifactMajor}`);
      return result;
    }

    // 3. Hash Verification
    const hashVersion = (v.hashVersion as number) || 1;
    const actualHash = calculateContentHash(v, hashVersion);
    result.actualHash = actualHash;

    if (!v.contentHash) {
      addError("ARTIFACT_HASH_MISMATCH", "Missing contentHash field");
    } else if (actualHash !== v.contentHash) {
      addError("ARTIFACT_HASH_MISMATCH", `Hash mismatch: expected ${v.contentHash}, got ${actualHash}`);
    }

    // 4. Zod Schema Validation
    let schema;
    switch (v.schema) {
      case "hardkas.snapshot": schema = SnapshotSchema; break;
      case "hardkas.txPlan": schema = TxPlanSchema; break;
      case "hardkas.txReceipt": schema = TxReceiptSchema; break;
      case "hardkas.txTrace": schema = TxTraceSchema; break;
      case "hardkas.signedTx": schema = SignedTxSchema; break;
    }

    if (schema) {
      const validation = schema.safeParse(v);
      if (!validation.success) {
        validation.error.issues.forEach((e: any) => {
          const pathStr = e.path.join(".");
          addError("ARTIFACT_SCHEMA_INVALID", `${pathStr}: ${e.message}`, pathStr);
        });
      }
    } else {
      addError("ARTIFACT_SCHEMA_INVALID", `Unsupported or unknown artifact schema: ${v.schema}`);
    }

    result.ok = result.issues.every(i => i.severity !== "error" && i.severity !== "critical");
    return result;

  } catch (e: any) {
    if (e instanceof SyntaxError) {
      addError("ARTIFACT_JSON_INVALID", `Invalid JSON: ${e.message}`);
    } else {
      addError("ARTIFACT_ID_INVALID", `Unexpected verification error: ${e.message}`);
    }
    return result;
  }
}

/**
 * Verifies an artifact's semantic and economic validity.
 */
export function verifyArtifactSemantics(artifact: unknown, context: VerificationContext = {}): ArtifactVerificationResult {
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
    if (issue.severity === "error" || issue.severity === "critical") result.errors.push(issue.message);
  };

  // 1. Fee & Economic Audit
  const feeAudit = verifyFeeSemantics(artifact);
  if (!feeAudit.ok) {
    feeAudit.issues.forEach(msg => {
      addIssue({
        code: "ECONOMIC_VIOLATION",
        severity: strict ? "error" : "warning",
        message: msg
      });
    });
  }

  const v = artifact as Record<string, unknown>;

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
  const lineageAudit = verifyLineage(v, context.parent, { strict });
  if (!lineageAudit.ok || (strict && !v.lineage)) {
    lineageAudit.issues.forEach(issue => {
      addIssue(issue);
    });
  }

  // 4. Hardening Fields
  if (strict) {
    if (!v.workflowId) addIssue({ code: "MISSING_WORKFLOW_ID", severity: "error", message: "Strict mode requires workflowId" });
    if (!v.assumptionLevel) addIssue({ code: "MISSING_ASSUMPTION_LEVEL", severity: "error", message: "Strict mode requires assumptionLevel" });
    if (!v.executionMode) addIssue({ code: "MISSING_EXECUTION_MODE", severity: "error", message: "Strict mode requires executionMode" });
  } else {
    if (!v.workflowId) addIssue({ code: "MISSING_WORKFLOW_ID", severity: "warning", message: "Missing workflowId" });
    if (!v.assumptionLevel) addIssue({ code: "MISSING_ASSUMPTION_LEVEL", severity: "warning", message: "Missing assumptionLevel" });
    if (!v.executionMode) addIssue({ code: "MISSING_EXECUTION_MODE", severity: "warning", message: "Missing executionMode" });
  }

  // 5. Network vs Address prefix check
  const networkId = context.networkId || (v.networkId as NetworkId);
  const networkIdStr = networkId as string;
  
  if (networkId && (v.from || v.to)) {
    const from = v.from as Record<string, unknown>;
    const to = v.to as Record<string, unknown>;
    const addr = from?.address || to?.address;
    const expectedPrefix = networkIdStr === "mainnet" ? "kaspa:" : 
                           networkIdStr.startsWith("testnet") ? "kaspatest:" : "kaspasim:";
    
    if (addr && typeof addr === "string" && !addr.startsWith(expectedPrefix)) {
       addIssue({
         code: "NETWORK_ADDRESS_MISMATCH",
         severity: "error",
         message: `Network/Address mismatch: network is ${networkId} but address is ${addr}`
       });
    }
  }

  return result;
}

/**
 * Verifies an artifact's replay consistency.
 * Honest implementation: reports as unsupported or not implemented.
 */
export async function verifyArtifactReplay(artifact: unknown, _context: VerificationContext = {}): Promise<ArtifactVerificationResult> {
  return {
    ok: false,
    issues: [{
      code: "REPLAY_UNSUPPORTED_CHECK",
      severity: "warning",
      message: "Replay verification (full consensus simulation) is currently unsupported in this build."
    }],
    errors: ["Replay verification (consensus) unsupported"]
  };
}

/**
 * @deprecated Use verifyArtifactIntegrity instead.
 */
export const verifyArtifact = verifyArtifactIntegrity;
export const verifyArtifactFile = verifyArtifactIntegrity;
