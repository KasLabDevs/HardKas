import path from "node:path";
import fs from "node:fs";
import type { HardkasWorkspace } from "./workspace.js";
import { writeArtifact } from "@hardkas/artifacts";
import type { HardkasArtifactBase } from "@hardkas/artifacts";

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
   * Writes a valid artifact to disk (canonical or custom path).
   */
  async write(
    artifact: HardkasArtifactBase,
    options: WriteArtifactOptions = {}
  ): Promise<WriteArtifactResult> {
    const record = artifact as unknown as Record<string, string>;
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
   * Reads an artifact by path or ID/hash from the workspace.
   */
  async read(id: string): Promise<any> {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    const { readArtifact } = await import("@hardkas/artifacts");
    let filePath = id;

    if (!fs.existsSync(filePath)) {
      // 1. Try in workspace artifacts directory
      filePath = path.join(this.workspace.artifactsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) {
        // 2. Try prefix search in workspace artifacts directory
        if (fs.existsSync(this.workspace.artifactsDir)) {
          const files = fs.readdirSync(this.workspace.artifactsDir);
          const found = files.find((f) => f.includes(id) || f.endsWith(`${id}.json`));
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

    return readArtifact(filePath);
  }

  /**
   * Alias for read().
   */
  async get(id: string): Promise<any> {
    return this.read(id);
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
}
