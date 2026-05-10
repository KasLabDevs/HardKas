import type { 
  TxPlan as TxPlanArtifact, 
  SignedTx as SignedTxArtifact, 
  TxReceipt as TxReceiptArtifact,
  TxTrace as TxTraceArtifact
} from "./schemas.js";
import { ARTIFACT_SCHEMAS } from "./constants.js";
import { 
  validateIgraTxPlanArtifact, 
  validateIgraSignedTxArtifact, 
  validateIgraTxReceiptArtifact 
} from "./igra-artifacts.js";

export interface ArtifactValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateTxPlanArtifact(value: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Artifact must be an object"] };
  const v = value as any;

  if (v.schema !== ARTIFACT_SCHEMAS.TX_PLAN) errors.push(`Invalid schema: expected '${ARTIFACT_SCHEMAS.TX_PLAN}'`);
  validateCommon(v, errors);
  
  if (typeof v.planId !== "string" || !v.planId) errors.push("Missing planId");
  
  if (!v.from || typeof v.from.address !== "string") errors.push("Missing or invalid 'from' address");
  if (!v.to || typeof v.to.address !== "string") errors.push("Missing or invalid 'to' address");
  
  assertDecimalBigIntString(v.amountSompi, "amountSompi", errors);
  if (!Array.isArray(v.inputs)) errors.push("Missing or invalid 'inputs' array");
  if (!Array.isArray(v.outputs)) errors.push("Missing or invalid 'outputs' array");

  return { ok: errors.length === 0, errors };
}

export function assertValidTxPlanArtifact(value: unknown): asserts value is TxPlanArtifact {
  const result = validateTxPlanArtifact(value);
  if (!result.ok) throw new Error(`Invalid tx plan artifact:\n${result.errors.map(e => `- ${e}`).join("\n")}`);
}

export function validateSignedTxArtifact(value: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Artifact must be an object"] };
  const v = value as any;

  if (v.schema !== ARTIFACT_SCHEMAS.SIGNED_TX) errors.push(`Invalid schema: expected '${ARTIFACT_SCHEMAS.SIGNED_TX}'`);
  validateCommon(v, errors);
  
  if (v.status !== "signed") errors.push("Invalid status: expected 'signed'");
  if (typeof v.signedId !== "string" || !v.signedId) errors.push("Missing signedId");
  if (typeof v.sourcePlanId !== "string" || !v.sourcePlanId) errors.push("Missing sourcePlanId");
  
  if (!v.signedTransaction) {
    errors.push("Missing signedTransaction object");
  } else {
    if (!["kaspa-sdk", "hex", "simulated", "unknown"].includes(v.signedTransaction.format)) {
      errors.push("Invalid signedTransaction.format");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidSignedTxArtifact(value: unknown): asserts value is SignedTxArtifact {
  const result = validateSignedTxArtifact(value);
  if (!result.ok) throw new Error(`Invalid signed tx artifact:\n${result.errors.map(e => `- ${e}`).join("\n")}`);
}

export function validateTxReceiptArtifact(value: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Artifact must be an object"] };
  const v = value as any;

  if (v.schema !== ARTIFACT_SCHEMAS.TX_RECEIPT) errors.push(`Invalid schema: expected '${ARTIFACT_SCHEMAS.TX_RECEIPT}'`);
  validateCommon(v, errors);
  
  if (!["submitted", "confirmed", "failed"].includes(v.status)) errors.push("Invalid status");
  if (typeof v.txId !== "string" || !v.txId) errors.push("Missing txId");
  assertDecimalBigIntString(v.amountSompi, "amountSompi", errors);
  assertDecimalBigIntString(v.feeSompi, "feeSompi", errors);

  return { ok: errors.length === 0, errors };
}

export function assertValidTxReceiptArtifact(value: unknown): asserts value is TxReceiptArtifact {
  const result = validateTxReceiptArtifact(value);
  if (!result.ok) throw new Error(`Invalid tx receipt artifact:\n${result.errors.map(e => `- ${e}`).join("\n")}`);
}

export function validateArtifact(data: unknown): ArtifactValidationResult {
  if (!data || typeof data !== "object") return { ok: false, errors: ["Artifact must be an object"] };
  const v = data as any;
  const schema = v.schema;

  switch (schema) {
    case ARTIFACT_SCHEMAS.TX_PLAN:
      return validateTxPlanArtifact(data);
    case ARTIFACT_SCHEMAS.SIGNED_TX:
      return validateSignedTxArtifact(data);
    case ARTIFACT_SCHEMAS.TX_RECEIPT:
      return validateTxReceiptArtifact(data);
    case ARTIFACT_SCHEMAS.IGRA_TX_PLAN:
      return validateIgraTxPlanArtifact(data);
    case ARTIFACT_SCHEMAS.IGRA_SIGNED_TX:
      return validateIgraSignedTxArtifact(data);
    case ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT:
      return validateIgraTxReceiptArtifact(data);
    default:
      return { ok: false, errors: [`Unknown or unsupported artifact schema: ${schema}`] };
  }
}

function validateCommon(v: any, errors: string[]): void {
  if (!v.hardkasVersion) errors.push("Missing hardkasVersion");
  if (typeof v.networkId !== "string" || !v.networkId) errors.push("Missing networkId");
  if (!["simulated", "node", "rpc", "l2-rpc", "real"].includes(v.mode)) errors.push("Invalid mode");
  if (!v.createdAt) errors.push("Missing createdAt");
}

function assertDecimalBigIntString(value: any, field: string, errors: string[]): void {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    errors.push(`Invalid ${field}: must be a decimal bigint string`);
  }
}
