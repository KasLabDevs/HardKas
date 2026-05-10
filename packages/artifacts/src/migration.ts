import { calculateContentHash } from "./canonical.js";
import { ARTIFACT_VERSION } from "./schemas.js";
import { sortUtxosByOutpoint } from "./verify.js";
import { HARDKAS_VERSION } from "./constants.js";

/**
 * Migrates a v1 artifact to canonical format by updating the schema, version, 
 * and calculating the contentHash.
 */
export function migrateToCanonical(v1Artifact: any): any {
  if (v1Artifact.version === ARTIFACT_VERSION) {
    return v1Artifact; // Already canonical
  }

  const v2Artifact = { ...v1Artifact };
  
  // 1. Update Schema & Version
  if (v1Artifact.schema) {
    v2Artifact.schema = v1Artifact.schema.replace(".v1", "");
  }
  v2Artifact.version = ARTIFACT_VERSION;

  // 2. Schema specific adjustments
  if (v2Artifact.schema === "hardkas.txPlan" && v1Artifact.selectedUtxos) {
    v2Artifact.inputs = v1Artifact.selectedUtxos;
    delete v2Artifact.selectedUtxos;
  }

  if (v2Artifact.schema === "hardkas.snapshot" && v1Artifact.utxos) {
     v2Artifact.utxos = sortUtxosByOutpoint(v1Artifact.utxos);
  }

  // 3. Ensure required v2 fields
  if (!v2Artifact.hardkasVersion) {
    v2Artifact.hardkasVersion = HARDKAS_VERSION;
  }
  if (!v2Artifact.createdAt) {
    v2Artifact.createdAt = new Date().toISOString();
  }

  // 4. Calculate Hash (Must be last)
  v2Artifact.contentHash = calculateContentHash(v2Artifact);

  return v2Artifact;
}
