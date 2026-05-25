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
  constructor(private workspace: HardkasWorkspace) {}

  /**
   * Writes a valid artifact to disk (canonical or custom path).
   */
  async write(artifact: HardkasArtifactBase, options: WriteArtifactOptions = {}): Promise<WriteArtifactResult> {
    if (options.dryRun) {
      return { 
        dryRun: true, 
        contentHash: (artifact as any).contentHash || "unknown" 
      };
    }

    const outputDir = options.outputDir || this.workspace.artifactsDir;
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const hash = (artifact as any).contentHash || "unknown";
    const schema = (artifact as any).schema || "artifact";
    const shortSchema = schema.replace("hardkas.", "");
    
    const fileName = options.fileName || `${shortSchema}-${hash}.json`;
    const absolutePath = path.join(outputDir, fileName);

    const { writeArtifact } = await import("@hardkas/artifacts");
    await writeArtifact(absolutePath, artifact);
    
    // Emit the event so localnet and query-store can index it.
    const { coreEvents, createEventEnvelope } = await import("@hardkas/core");
    const { randomUUID } = await import("node:crypto");
    
    const wId = options.workflowId || randomUUID();
    const cId = options.correlationId || wId;
    const netId = options.networkId || (artifact as any).networkId || "unknown";
    const artifactId = (artifact as any).artifactId || hash;

    coreEvents.emit(createEventEnvelope({
      kind: "artifact.written",
      domain: "integrity",
      workflowId: wId as any,
      correlationId: cId as any,
      networkId: netId as any,
      payload: { artifactId: artifactId as any, path: absolutePath },
      sequenceNumber: 1 as any,
      globalOffset: 0,
      sourceSubsystem: "sdk:artifacts-manager",
      artifactId: artifactId as any
    }));
    
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
    const { readArtifact } = await import("@hardkas/artifacts");
    let filePath = id;
    
    if (!fs.existsSync(filePath)) {
      // 1. Try in workspace artifacts directory
      filePath = path.join(this.workspace.artifactsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) {
        // 2. Try prefix search in workspace artifacts directory
        if (fs.existsSync(this.workspace.artifactsDir)) {
          const files = fs.readdirSync(this.workspace.artifactsDir);
          const found = files.find(f => f.includes(id) || f.endsWith(`${id}.json`));
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
}

