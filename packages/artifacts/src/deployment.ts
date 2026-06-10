import { HARDKAS_VERSION } from "./constants.js";
import { ARTIFACT_VERSION } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { DeploymentRecord, DeploymentSummary } from "./types.js";
import { NetworkId, ArtifactId, TxId, ContentHash } from "@hardkas/core";
import { HardkasSchemas } from "@hardkas/core";

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
  const recordDraft: Omit<DeploymentRecord, "contentHash"> = {
    schema: HardkasSchemas.DeploymentV1,
    label: opts.label,
    networkId: opts.networkId,
    status: opts.status || "planned",
    deployedAt: new Date().toISOString(),
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    mode: "real",
    ...(opts.txId ? { txId: opts.txId } : {}),
    ...(opts.planArtifactId ? { planArtifactId: opts.planArtifactId } : {}),
    ...(opts.receiptArtifactId ? { receiptArtifactId: opts.receiptArtifactId } : {}),
    ...(opts.deployedAddresses ? { deployedAddresses: opts.deployedAddresses } : {}),
    ...(opts.deployer ? { deployer: opts.deployer } : {}),
    ...(opts.payloadHash ? { payloadHash: opts.payloadHash } : {}),
    ...(opts.notes ? { notes: opts.notes } : {})
  };

  const contentHash = calculateContentHash(
    recordDraft,
    CURRENT_HASH_VERSION
  ) as unknown as ContentHash;
  return {
    ...recordDraft,
    contentHash
  };
}

export function updateDeploymentStatus(
  record: DeploymentRecord,
  newStatus: DeploymentRecord["status"],
  txId?: TxId
): DeploymentRecord {
  const updatedDraft: Omit<DeploymentRecord, "contentHash"> = {
    ...record,
    status: newStatus,
    deployedAt: new Date().toISOString(),
    ...(txId ? { txId } : {})
  };

  const contentHash = calculateContentHash(
    updatedDraft,
    CURRENT_HASH_VERSION
  ) as unknown as ContentHash;
  return {
    ...updatedDraft,
    contentHash
  };
}
