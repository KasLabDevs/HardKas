import type { AuthScope } from "./verify.js";
import {
  ArtifactResolveError,
  parseUntypedLookup,
  resolveArtifactSync,
  type LookupInput,
  type LookupNamespace,
  type ResolveErrorCode
} from "./resolve.js";

// -----------------------------------------------------------------------------
// Wave 5 · DEF-17 · Evidence Discoverability — CLI-facing artifact identity façade.
// Wave 1.2 (rc.23 remediation) · Closure Pack IC-5′ / D-Q3.a: the façade delegates
// to the verified, namespaced resolver.
//
// Accepted without a namespace:
//   1. an exact artifact file path (absolute or workspace-relative, contained);
//   2. an exact 64-hex artifactId (the recomputed contentHash).
// Anything else needs its namespace (`{ namespace: "plan" | "signed" | "tx" |
// "workflow" }`, the CLI flags `--plan`, `--signed`, `--tx`, `--workflow`) and is
// otherwise rejected with NAMESPACE_REQUIRED. Every returned artifact was verified
// (declared hash version, claimed identity, derived label) before it was returned.
// -----------------------------------------------------------------------------

export type ArtifactHandleErrorCode =
  | ResolveErrorCode
  | "ARTIFACT_AMBIGUOUS";

export class ArtifactHandleError extends Error {
  readonly code: ArtifactHandleErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(
    code: ArtifactHandleErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ArtifactHandleError";
    this.code = code;
    if (context !== undefined) this.context = context;
  }
}

export interface ArtifactHandle {
  /** Resolved absolute filesystem path to the artifact file. */
  readonly path: string;
  /** Parsed artifact JSON. */
  readonly artifact: any;
  /** Canonical artifactId: the hash recomputed under the declared version. */
  readonly artifactId: string;
  /** What that hash authenticated (FULL for the current version, LEGACY for v1–v4). */
  readonly authScope: AuthScope;
  /** Which input form resolved the handle. */
  readonly resolvedBy: "path" | "artifactId" | "label" | "txId" | "workflowId";
  readonly namespace: LookupNamespace;
  /** Every identical copy found in the workspace (the first is `path`). */
  readonly copies: readonly string[];
}

export interface ResolveArtifactHandleOptions {
  /** Explicit namespace for the input (labels, txIds and workflowIds require it). */
  namespace?: LookupNamespace;
}

/**
 * Resolve an artifact from the accepted CLI-facing identity forms (see header).
 * Throws a typed ArtifactHandleError on every failure.
 */
export async function resolveArtifactHandle(
  input: string,
  workspaceRoot: string,
  options: ResolveArtifactHandleOptions = {}
): Promise<ArtifactHandle> {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new ArtifactHandleError("ARTIFACT_INPUT_UNRECOGNIZED", "Artifact input must be a non-empty string");
  }
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0) {
    throw new ArtifactHandleError("ARTIFACT_INPUT_UNRECOGNIZED", "workspaceRoot must be a non-empty string");
  }
  try {
    const lookup: LookupInput = options.namespace
      ? ({ [options.namespace]: input } as LookupInput)
      : parseUntypedLookup(input);
    const r = resolveArtifactSync(workspaceRoot, lookup);
    return {
      path: r.path,
      artifact: r.artifact,
      artifactId: r.artifactId,
      authScope: r.authScope,
      resolvedBy: r.resolvedBy,
      namespace: r.namespace,
      copies: r.copies
    };
  } catch (e) {
    if (e instanceof ArtifactResolveError) {
      throw new ArtifactHandleError(e.code, e.message, e.context);
    }
    throw e;
  }
}
