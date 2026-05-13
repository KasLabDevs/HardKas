import { ARTIFACT_SCHEMAS, HARDKAS_VERSION } from "./constants.js";
import { ArtifactValidationResult } from "./validate.js";

export interface IgraTxRequestArtifact {
  readonly from?: string;
  readonly to?: string;
  readonly data: string;
  readonly valueWei: string;
  readonly gasLimit?: string;
  readonly gasPriceWei?: string;
  readonly nonce?: string;
}

export interface IgraTxPlanArtifact {
  readonly schema: "hardkas.igraTxPlan.v1";
  readonly hardkasVersion: string;
  readonly networkId: string;
  readonly mode: "l2-rpc";
  readonly createdAt: string;
  readonly planId: string;
  readonly l2Network: string;
  readonly chainId: number;
  readonly txType?: "call" | "contract-deploy";
  readonly request: IgraTxRequestArtifact;
  readonly estimatedGas?: string;
  readonly estimatedFeeWei?: string;
  readonly status: "built";
}

export interface IgraSignedTxArtifact {
  readonly schema: "hardkas.igraSignedTx.v1";
  readonly hardkasVersion: string;
  readonly networkId: string;
  readonly mode: "l2-rpc";
  readonly createdAt: string;
  readonly signedId: string;
  readonly sourcePlanId: string;
  readonly sourcePlanPath?: string;
  readonly l2Network: string;
  readonly chainId: number;
  readonly rawTransaction: string;
  readonly txHash?: string;
  readonly status: "signed";
}

export interface IgraTxReceiptArtifact {
  readonly schema: "hardkas.igraTxReceipt.v1";
  readonly hardkasVersion: string;
  readonly networkId: string;
  readonly mode: "l2-rpc";
  readonly createdAt: string;
  readonly txHash: string;
  readonly sourceSignedId?: string;
  readonly sourceSignedPath?: string;
  readonly l2Network: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly blockNumber?: string;
  readonly status: "submitted" | "confirmed" | "failed";
}

// Validators

export function isIgraTxPlanArtifact(value: unknown): value is IgraTxPlanArtifact {
  return validateIgraTxPlanArtifact(value).ok;
}

export function validateIgraTxPlanArtifact(value: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Artifact must be an object"] };
  const v = value as any;

  if (v.schema !== ARTIFACT_SCHEMAS.IGRA_TX_PLAN) errors.push(`Invalid schema: expected '${ARTIFACT_SCHEMAS.IGRA_TX_PLAN}'`);
  validateCommon(v, errors);
  if (v.status !== "built") errors.push("Invalid status: expected 'built'");
  if (typeof v.planId !== "string" || !v.planId) errors.push("Missing planId");
  if (typeof v.chainId !== "number" || v.chainId <= 0) errors.push("Invalid chainId");
  
  if (!v.request || typeof v.request !== "object") {
    errors.push("Missing or invalid request object");
  } else {
    const r = v.request;
    if (r.from) assertEvmAddress(r.from, "request.from", errors);
    if (v.txType === "contract-deploy") {
      if (r.to !== undefined && r.to !== null) {
        errors.push("request.to must be empty for contract-deploy");
      }
    } else {
      if (r.to) assertEvmAddress(r.to, "request.to", errors);
    }
    assertHexData(r.data, "request.data", errors);
    assertDecimalBigIntString(r.valueWei, "request.valueWei", errors);
    if (r.gasLimit) assertDecimalBigIntString(r.gasLimit, "request.gasLimit", errors);
    if (r.gasPriceWei) assertDecimalBigIntString(r.gasPriceWei, "request.gasPriceWei", errors);
    if (r.nonce) assertDecimalBigIntString(r.nonce, "request.nonce", errors);
  }

  if (v.estimatedGas) assertDecimalBigIntString(v.estimatedGas, "estimatedGas", errors);
  if (v.estimatedFeeWei) assertDecimalBigIntString(v.estimatedFeeWei, "estimatedFeeWei", errors);

  return { ok: errors.length === 0, errors };
}

export function assertValidIgraTxPlanArtifact(value: unknown): asserts value is IgraTxPlanArtifact {
  const result = validateIgraTxPlanArtifact(value);
  if (!result.ok) {
    throw new Error(`Invalid Igra tx plan artifact:\n${result.errors.map(e => `- ${e}`).join("\n")}`);
  }
}

export function validateIgraSignedTxArtifact(value: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Artifact must be an object"] };
  const v = value as any;

  if (v.schema !== ARTIFACT_SCHEMAS.IGRA_SIGNED_TX) errors.push(`Invalid schema: expected '${ARTIFACT_SCHEMAS.IGRA_SIGNED_TX}'`);
  validateCommon(v, errors);
  if (v.status !== "signed") errors.push("Invalid status: expected 'signed'");
  if (typeof v.signedId !== "string" || !v.signedId) errors.push("Missing signedId");
  if (typeof v.sourcePlanId !== "string" || !v.sourcePlanId) errors.push("Missing sourcePlanId");
  assertHexData(v.rawTransaction, "rawTransaction", errors);
  if (v.txHash) assertEvmTxHash(v.txHash, "txHash", errors);

  return { ok: errors.length === 0, errors };
}

export function assertValidIgraSignedTxArtifact(value: unknown): asserts value is IgraSignedTxArtifact {
  const result = validateIgraSignedTxArtifact(value);
  if (!result.ok) {
    throw new Error(`Invalid Igra signed tx artifact:\n${result.errors.map(e => `- ${e}`).join("\n")}`);
  }
}

export function validateIgraTxReceiptArtifact(value: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Artifact must be an object"] };
  const v = value as any;

  if (v.schema !== ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT) errors.push(`Invalid schema: expected '${ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT}'`);
  validateCommon(v, errors);
  if (!["submitted", "confirmed", "failed"].includes(v.status)) errors.push("Invalid status");
  assertEvmTxHash(v.txHash, "txHash", errors);
  if (typeof v.rpcUrl !== "string" || !v.rpcUrl) errors.push("Missing rpcUrl");
  if (v.blockNumber) assertDecimalBigIntString(v.blockNumber, "blockNumber", errors);

  return { ok: errors.length === 0, errors };
}

export function assertValidIgraTxReceiptArtifact(value: unknown): asserts value is IgraTxReceiptArtifact {
  const result = validateIgraTxReceiptArtifact(value);
  if (!result.ok) {
    throw new Error(`Invalid Igra tx receipt artifact:\n${result.errors.map(e => `- ${e}`).join("\n")}`);
  }
}

function validateCommon(v: any, errors: string[]): void {
  if (!v.hardkasVersion) errors.push("Missing hardkasVersion");
  if (typeof v.networkId !== "string" || !v.networkId) errors.push("Missing networkId");
  if (v.mode !== "l2-rpc") errors.push("Invalid mode: expected 'l2-rpc'");
  if (!v.createdAt) errors.push("Missing createdAt");
  if (typeof v.l2Network !== "string" || !v.l2Network) errors.push("Missing l2Network");
}

// Helpers

export function assertDecimalBigIntString(value: any, field: string, errors: string[]): void {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    errors.push(`Invalid ${field}: must be a decimal bigint string`);
  }
}

export function assertHexData(value: any, field: string, errors: string[]): void {
  if (typeof value !== "string" || !/^0x([a-fA-F0-9]{2})*$/.test(value)) {
    errors.push(`Invalid ${field}: must be a 0x-prefixed hex string`);
  }
}

export function assertEvmAddress(value: any, field: string, errors: string[]): void {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    errors.push(`Invalid ${field}: must be a 0x-prefixed 40-character EVM address`);
  }
}

export function assertEvmTxHash(value: any, field: string, errors: string[]): void {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    errors.push(`Invalid ${field}: must be a 0x-prefixed 64-character EVM transaction hash`);
  }
}

export function createIgraPlanId(hash: string): string {
  return `igra-plan-${hash.slice(0, 16)}`;
}

export function createIgraSignedId(hash: string): string {
  return `igra-signed-${hash.slice(0, 16)}`;
}

export function createIgraDeployPlanId(hash: string): string {
  return `igradeploy_${hash.slice(0, 16)}`;
}
