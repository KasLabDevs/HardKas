import { HARDKAS_VERSION } from "./constants.js";
import { ARTIFACT_VERSION } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { DeploymentRecord, DeploymentSummary } from "./types.js";
import { NetworkId, ArtifactId, TxId, ContentHash } from "@hardkas/core";

// SAFETY_LEVEL: SIMULATION_ONLY

export type { DeploymentRecord, DeploymentSummary };

export function createDeploymentRecord(opts: {
  label: string;
  networkId: NetworkId;
  status?: "planned" | "sent" | "confirmed" | "failed" | "unknown";
  txId?: TxId;
  planArtifactId?: ArtifactId;
  receiptArtifactId?: ArtifactId;
  deployedAddresses?: string[];
  deployer?: string;
  payloadHash?: string;
  notes?: string;
}): DeploymentRecord {
  const record: any = {
    schema: "hardkas.deployment.v1",
    label: opts.label,
    networkId: opts.networkId,
    status: opts.status || "planned",
    deployedAt: new Date().toISOString(),
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    mode: "real"
  };

  if (opts.txId) record.txId = opts.txId;
  if (opts.planArtifactId) record.planArtifactId = opts.planArtifactId;
  if (opts.receiptArtifactId) record.receiptArtifactId = opts.receiptArtifactId;
  if (opts.deployedAddresses) record.deployedAddresses = opts.deployedAddresses;
  if (opts.deployer) record.deployer = opts.deployer;
  if (opts.payloadHash) record.payloadHash = opts.payloadHash;
  if (opts.notes) record.notes = opts.notes;

  // Canonical content hash
  record.contentHash = calculateContentHash(record, CURRENT_HASH_VERSION) as unknown as ContentHash;
  return record as DeploymentRecord;
}

export function updateDeploymentStatus(
  record: DeploymentRecord,
  newStatus: DeploymentRecord["status"],
  txId?: TxId
): DeploymentRecord {
  const updated: any = {
    ...record,
    status: newStatus,
    deployedAt: new Date().toISOString()
  };
  
  if (txId) updated.txId = txId;
  
  delete updated.contentHash;
  updated.contentHash = calculateContentHash(updated, CURRENT_HASH_VERSION) as unknown as ContentHash;
  return updated as DeploymentRecord;
}
