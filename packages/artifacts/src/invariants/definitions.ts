import { Invariant, InvariantContext, InvariantViolation } from "./types.js";
import { calculateContentHash } from "../canonical.js";
import { ARTIFACT_SCHEMAS } from "../constants.js";

/**
 * Verifies that the artifact's contentHash field matches the calculated hash.
 */
export class HashInvariant implements Invariant {
  readonly id = "INVAR_HASH_MATCH";
  readonly description = "Artifact content hash must match payload";

  async check(context: InvariantContext): Promise<InvariantViolation[]> {
    const { artifact } = context;
    if (!artifact || typeof artifact !== "object") return [];
    
    // Narrowing unknown to Record for property access (safe after object check)
    const v = artifact as Record<string, unknown>;
    const contentHash = v.contentHash;
    if (typeof contentHash !== "string") return [];

    const actualHash = calculateContentHash(v);
    if (actualHash !== contentHash) {
      return [{
        code: this.id,
        severity: "error",
        message: `Hash mismatch: expected ${contentHash}, got ${actualHash}`,
        metadata: { artifactId: typeof v.artifactId === "string" ? v.artifactId : undefined }
      }];
    }
    return [];
  }
}

/**
 * Verifies that the artifact schema and version are supported.
 */
export class SchemaInvariant implements Invariant {
  readonly id = "INVAR_SCHEMA_SUPPORT";
  readonly description = "Artifact schema and version must be supported";

  async check(context: InvariantContext): Promise<InvariantViolation[]> {
    const { artifact } = context;
    if (!artifact || typeof artifact !== "object") return [];

    // Narrowing unknown to Record for property access
    const v = artifact as Record<string, unknown>;
    const schema = v.schema;
    const version = v.version;

    if (typeof schema !== "string" || typeof version !== "string") {
      return [{
        code: this.id,
        severity: "error",
        message: "Artifact missing schema or version metadata"
      }];
    }

    const supportedSchemas = Object.values(ARTIFACT_SCHEMAS) as string[];
    if (!supportedSchemas.includes(schema)) {
      return [{
        code: this.id,
        severity: "error",
        message: `Unsupported schema: ${schema}`
      }];
    }

    return [];
  }
}

/**
 * Basic correlation invariant: workflowId and correlationId should be present in events.
 */
export class BasicCorrelationInvariant implements Invariant {
  readonly id = "INVAR_BASIC_CORRELATION";
  readonly description = "Events must have workflowId and correlationId";

  async check(context: InvariantContext): Promise<InvariantViolation[]> {
    const { event } = context;
    if (!event) return [];

    const violations: InvariantViolation[] = [];
    if (!event.workflowId) {
      violations.push({
        code: this.id,
        severity: "error",
        message: "Missing workflowId in event",
        metadata: { eventId: event.eventId }
      });
    }
    if (!event.correlationId) {
      violations.push({
        code: this.id,
        severity: "warning",
        message: "Missing correlationId in event",
        metadata: { eventId: event.eventId }
      });
    }

    return violations;
  }
}

/**
 * Basic lineage invariant: if parentArtifactId is present, it should ideally be resolvable.
 */
export class BasicLineageInvariant implements Invariant {
  readonly id = "INVAR_BASIC_LINEAGE";
  readonly description = "Parent artifact should be resolvable if specified";

  async check(context: InvariantContext): Promise<InvariantViolation[]> {
    const { artifact, artifactStore } = context;
    if (!artifact || typeof artifact !== "object") return [];

    // Narrowing unknown to Record for property access
    const v = artifact as Record<string, unknown>;
    const lineage = v.lineage as Record<string, unknown> | undefined;
    const parentArtifactId = lineage?.parentArtifactId;

    if (!lineage || typeof parentArtifactId !== "string" || !artifactStore) return [];

    const parent = await artifactStore.getArtifact(parentArtifactId);
    if (!parent) {
      return [{
        code: this.id,
        severity: "warning",
        message: `Parent artifact ${parentArtifactId} not found in store`,
        metadata: { childId: typeof v.artifactId === "string" ? v.artifactId : undefined }
      }];
    }

    return [];
  }
}

/**
 * Contract/Stub: Lifecycle invariant (ordering of events).
 */
export class LifecycleInvariant implements Invariant {
  readonly id = "INVAR_LIFECYCLE_ORDER";
  readonly description = "Workflow events must follow valid lifecycle ordering";
  async check(): Promise<InvariantViolation[]> { return []; }
}

/**
 * Contract/Stub: Network invariant (address prefix matching).
 */
export class NetworkInvariant implements Invariant {
  readonly id = "INVAR_NETWORK_PREFIX";
  readonly description = "Network ID must match address prefixes";
  async check(): Promise<InvariantViolation[]> { return []; }
}

/**
 * Contract/Stub: Replay invariant (re-execution consistency).
 */
export class ReplayInvariant implements Invariant {
  readonly id = "INVAR_REPLAY_CONSISTENCY";
  readonly description = "Replay execution must produce consistent results";
  async check(): Promise<InvariantViolation[]> { return []; }
}
