import path from "node:path";
import fs from "node:fs";
import type { HardkasWorkspace } from "./workspace.js";
import { writeArtifact } from "@hardkas/artifacts";
import type { HardkasArtifactBase } from "@hardkas/artifacts";
import { HardkasError } from "@hardkas/core";

export interface WriteArtifactOptions {
  /**
   * Explicitly override the canonical artifacts directory.
   * By default, it writes to sdk.workspace.artifactsDir.
   */
  outputDir?: string;

  /**
   * Explicitly override the default filename.
   * By default, it generates `${schema}-${contentHash}.json`
   */
  fileName?: string;

  /**
   * If true, verifies integrity and schema but does not touch the filesystem.
   * Useful for Agent planning or previews.
   */
  dryRun?: boolean;

  /** Telemetry for Event Sourcing */
  workflowId?: string;
  correlationId?: string;
  networkId?: string;
}

export interface WriteArtifactResult {
  absolutePath?: string;
  dryRun: boolean;
  contentHash: string;
}

/**
 * Deterministic Artifact I/O boundary.
 */
export class HardkasArtifactsManager {
  private cache = new Map<string, any>();

  constructor(private workspace: HardkasWorkspace) {}

  /**
   * Caches an in-memory artifact.
   */
  cacheArtifact(artifact: any): void {
    const record = artifact as unknown as Record<string, string>;
    const hash = record.contentHash || "unknown";
    if (record.planId) this.cache.set(record.planId, artifact);
    if (record.signedId) this.cache.set(record.signedId, artifact);
    if (record.txId) this.cache.set(record.txId, artifact);
    this.cache.set(hash, artifact);
  }

  /**
   * Writes a valid artifact to disk (canonical or custom path).
   */
  async write(
    artifact: HardkasArtifactBase,
    options: WriteArtifactOptions = {}
  ): Promise<WriteArtifactResult> {
    const record = artifact as unknown as Record<string, any>;
    
    // Ensure hashVersion is explicitly written to disk so readers don't fallback to v1
    if (!record.hashVersion) {
      const { CURRENT_HASH_VERSION } = await import("@hardkas/artifacts");
      record.hashVersion = CURRENT_HASH_VERSION;
    }

    const hash = record.contentHash || "unknown";
    if (record.planId) this.cache.set(record.planId, artifact);
    if (record.signedId) this.cache.set(record.signedId, artifact);
    if (record.txId) this.cache.set(record.txId, artifact);
    this.cache.set(hash, artifact);

    if (options.dryRun) {
      return {
        dryRun: true,
        contentHash: hash
      };
    }

    const outputDir = options.outputDir || this.workspace.artifactsDir;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const schema = record.schema || "artifact";
    const shortSchema = schema.replace("hardkas.", "");

    const fileName = options.fileName || `${shortSchema}-${hash}.json`;
    const absolutePath = path.join(outputDir, fileName);

    const { writeArtifact } = await import("@hardkas/artifacts");
    await writeArtifact(absolutePath, artifact);

    // Emit the event so localnet and query-store can index it.
    const {
      coreEvents,
      createEventEnvelope,
      asWorkflowId,
      asCorrelationId,
      asNetworkId,
      asArtifactId,
      asEventSequence
    } = await import("@hardkas/core");
    // If no workflowId is provided, this artifact is standalone.
    // "wf_unknown_standalone" is a sentinel value for tracking provenance of loose artifacts.
    // It is NOT a replayable causal workflow identity.
    const wId = options.workflowId || "wf_unknown_standalone";
    const cId = options.correlationId || wId;
    const netId = options.networkId || record.networkId || "unknown";
    const artifactId = record.artifactId || hash;

    coreEvents.emit(
      createEventEnvelope({
        kind: "artifact.written",
        domain: "integrity",
        workflowId: asWorkflowId(wId),
        correlationId: asCorrelationId(cId),
        networkId: asNetworkId(netId),
        payload: { artifactId: asArtifactId(artifactId), path: absolutePath },
        sequenceNumber: asEventSequence(1),
        globalOffset: 0,
        sourceSubsystem: "sdk:artifacts-manager",
        artifactId: asArtifactId(artifactId)
      })
    );

    return {
      absolutePath,
      dryRun: false,
      contentHash: hash
    };
  }

  /**
   * Retrieves an artifact from the in-memory cache.
   */
  getCached(id: string): any {
    return this.cache.get(id);
  }

  /**
   * Reads an artifact by path or ID/hash from the workspace.
   */
  async read(id: string, options?: { expectedSchema?: string }): Promise<any> {

    const { readArtifact } = await import("@hardkas/artifacts");
    let filePath = id;

    // Path Boundary Sandbox Enforcement
    let resolvedPath = path.resolve(this.workspace.root, filePath);
    if (fs.existsSync(resolvedPath)) {
      resolvedPath = fs.realpathSync(resolvedPath);
    }

    const rootRel = path.relative(this.workspace.root, resolvedPath);
    const artifactsRel = path.relative(this.workspace.artifactsDir, resolvedPath);

    // Ensure it does NOT escape both root and artifactsDir
    if (
      (rootRel.startsWith("..") || path.isAbsolute(rootRel)) &&
      (artifactsRel.startsWith("..") || path.isAbsolute(artifactsRel))
    ) {
      throw new HardkasError("PATH_TRAVERSAL", "Artifact path escapes workspace boundary");
    }

    if (!fs.existsSync(filePath)) {
      // 1. Try in workspace artifacts directory
      filePath = path.join(this.workspace.artifactsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) {
        // 2. Try prefix search in workspace artifacts directory
        if (fs.existsSync(this.workspace.artifactsDir)) {
          const files = fs.readdirSync(this.workspace.artifactsDir);
          let found = files.find((f) => 
            f === `${id}.json` || 
            f.startsWith(`${id}-`) || 
            f.startsWith(`${id}.`) || 
            f.endsWith(`-${id}.json`) ||
            f.endsWith(`-${id}.plan.json`) ||
            f.endsWith(`-${id}.signed.json`) ||
            f.endsWith(`-${id}.receipt.json`)
          );
          
          if (!found) {
            const shortId = id.startsWith("plan-") || id.startsWith("signed-") ? id : id.slice(0, 16);
            for (const file of files) {
              if (!file.endsWith(".json")) continue;
              
              // Fast path: if the filename contains the ID, check it first.
              // But we MUST check all files if the fast path fails, because sometimes 
              // artifacts (like funding receipts) have filenames based on txId instead of contentHash.
              const fp = path.join(this.workspace.artifactsDir, file);
              try {
                const content = fs.readFileSync(fp, "utf-8");
                const obj = JSON.parse(content);
                if (
                  obj.contentHash === id ||
                  obj.artifactId === id ||
                  obj.planId === id ||
                  obj.signedId === id ||
                  obj.txId === id
                ) {
                  found = file;
                  break;
                }
              } catch {}
            }
          }
          
          if (found) {
            filePath = path.join(this.workspace.artifactsDir, found);
          } else {
            throw new Error(`Artifact ${id} not found in workspace.`);
          }
        } else {
          throw new Error(`Artifact ${id} not found in workspace.`);
        }
      }
    }

    const artifact: any = await readArtifact(filePath);
    if (options?.expectedSchema && artifact.schema !== options.expectedSchema) {
      throw new Error(`Artifact ${id} has schema '${artifact.schema}' but expected '${options.expectedSchema}'`);
    }
    return artifact;
  }

  /**
   * Alias for read().
   */
  async get(id: string, options?: { expectedSchema?: string }): Promise<any> {
    return this.read(id, options);
  }

  /**
   * Lists all artifacts in the workspace.
   */
  async list(): Promise<any[]> {
    if (!fs.existsSync(this.workspace.artifactsDir)) {
      return [];
    }
    const { readArtifact } = await import("@hardkas/artifacts");
    const files = fs.readdirSync(this.workspace.artifactsDir);
    const artifacts = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const artifact = await readArtifact(path.join(this.workspace.artifactsDir, file));
          artifacts.push(artifact);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    return artifacts;
  }

  /**
   * Cryptographically verifies the determinism and integrity of an artifact.
   * Throws an error with details if corruption or mismatch is found.
   */
  async verify(
    target: any,
    options: { throwOnInvalid?: boolean; strict?: boolean; enforceMetadata?: boolean } = {}
  ): Promise<any> {
    const throwOnInvalid = options.throwOnInvalid ?? true;
    const strict = options.strict ?? false;
    const enforceMetadata = options.enforceMetadata ?? true;
    
    let artifact: any;
    let id: string;

    if (typeof target === "string") {
      id = target;
      if (!id) {
        if (throwOnInvalid) throw new Error("No artifact target provided for verification.");
        return { valid: false, reason: "unknown", message: "No artifact target provided for verification." };
      }
      try {
        artifact = await this.read(id);
      } catch (e: any) {
        if (throwOnInvalid) throw e;
        return { valid: false, reason: "missing_artifact", message: e.message, artifactId: id };
      }
    } else {
      artifact = target;
      id = (artifact.artifactId || artifact.contentHash || "") as string;
    }

    const { verifyArtifactIntegrity, verifyArtifactSemantics } = await import("@hardkas/artifacts");
    
    const result = await verifyArtifactIntegrity(artifact);
    if (result.ok && strict) {
      const semResult = verifyArtifactSemantics(artifact, { 
        strict: true, 
        artifactsDir: this.workspace.artifactsDir,
        enforceMetadata,
        resolveArtifact: (id: string) => this.cache.get(id)
      });
      if (!semResult.ok) {
        result.ok = false;
        result.errors.push(...semResult.errors);
        result.issues.push(...semResult.issues);
      }
    }

    if (!result.ok) {
       const mappedReason = 
         result.issues[0]?.code === "HASH_MISMATCH" ? "content_hash_mismatch" : 
         result.issues[0]?.code === "MISSING_CONTENT_HASH" ? "missing_content_hash" : 
         result.issues[0]?.code === "MISSING_SIGNATURE" ? "missing_signature" : 
         result.issues[0]?.code === "REFERENCE_MISSING" ? "reference_missing" :
         result.issues[0]?.code === "REFERENCE_HASH_MISMATCH" ? "reference_hash_mismatch" :
         result.issues[0]?.code === "POLICY_VIOLATION" ? "policy_violation" :
         result.issues[0]?.code === "LEGACY_HASH_VERSION_UNSAFE" ? "legacy_hash_version_unsafe" :
         result.issues[0]?.code === "PARENT_MISSING" ? "parent_missing" : "schema_invalid";

       if (throwOnInvalid) {
         throw new Error(`Artifact ${id} corrupted or invalid: ` + JSON.stringify(result.issues, null, 2));
       }
       return { 
         valid: false, 
         reason: mappedReason,
         message: result.issues.map((i: any) => i.message).join(", "),
         artifactId: id,
         expected: result.expectedHash,
         actual: result.actualHash,
         details: result.issues
       };
    }

    if (!throwOnInvalid) {
      return { valid: true, artifactId: id, details: result };
    }

    return result;
  }

  /**
   * Migrates a legacy artifact to v4 using a migration receipt.
   */
  async migrate(
    target: any,
    migrationId: string
  ): Promise<{ migrated: any; receipt: any }> {
    let artifact: any;
    if (typeof target === "string") {
      artifact = await this.read(target);
    } else {
      artifact = target;
    }

    const { migrateArtifactPayload, generateMigrationReceipt } = await import("@hardkas/artifacts");
    
    // Perform in-memory migration
    const result = migrateArtifactPayload(artifact, undefined, { strictPolicy: false });
    if (!result.migrated) {
      throw new Error(`Artifact ${artifact.artifactId || artifact.contentHash} is already at the target version or cannot be migrated.`);
    }

    // Generate receipt
    const receipt = generateMigrationReceipt(artifact, result.artifact, migrationId);

    // Save both to workspace
    await this.write(result.artifact as any);
    await this.write(receipt as any);

    return { migrated: result.artifact, receipt };
  }
}
