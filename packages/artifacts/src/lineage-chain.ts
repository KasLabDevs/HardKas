import { ARTIFACT_ID_PATTERN, checkArtifactIdentity, resolveArtifactSync } from "./resolve.js";
import { verifyLineage } from "./lineage.js";
import type { VerificationIssue } from "./verify.js";

// EVIDENCE-TRUST-1 (ET-C2): a lineage claim comes only from what was looked up. Every command that shows a parent or a
// provenance chain resolves it through the workspace store with the verified resolver `hardkas verify` uses, and says
// which of these it found — never "missing" for a workspace nobody searched, never "complete" for a chain nobody walked.

/** What looking a parent up found. */
export type ParentStatus = "resolved" | "missing" | "invalid" | "unresolved" | "root";

export interface ParentResolution {
  /**
   * resolved: a copy that verifies as the referenced identity · missing: searched, not there · invalid: a copy there does
   * not verify as that identity · unresolved: nowhere was searched (no workspace root, no resolver) · root: no parent.
   */
  status: ParentStatus;
  /** The referenced parent identity (absent for a root). */
  artifactId?: string;
  /** Why it is invalid or unresolved. */
  detail?: string;
}

export interface ParentLookup {
  /** The workspace whose store is searched. */
  workspaceRoot?: string;
  /** Looked at first; what it returns must verify as the referenced identity. */
  resolveArtifact?: (artifactId: string) => any;
}

/**
 * The parent an artifact references: only the authenticated `lineage.parentArtifactId` (an empty one is an explicit
 * root), or — for artifacts written before the lineage block — a top-level 64-hex `parentArtifactId`. Labels
 * (`sourcePlanId`, `sourceSignedId`) never resolve a reference.
 */
export function parentReferenceOf(artifact: any): string | undefined {
  const lineage = artifact?.lineage;
  if (lineage && typeof lineage === "object" && "parentArtifactId" in lineage) {
    const id = lineage.parentArtifactId;
    return typeof id === "string" && id.length > 0 && id !== lineage.artifactId ? id : undefined;
  }
  const legacy = artifact?.parentArtifactId;
  return typeof legacy === "string" && ARTIFACT_ID_PATTERN.test(legacy) ? legacy : undefined;
}

/** Looks the artifact's parent up (see `ParentResolution`); a resolved parent comes back with its verified copy. */
export function resolveParentReference(
  artifact: any,
  lookup: ParentLookup = {}
): ParentResolution & { artifact?: any } {
  const artifactId = parentReferenceOf(artifact);
  if (!artifactId) return { status: "root" };
  if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
    return { status: "invalid", artifactId, detail: "the reference is not a 64-hex artifactId" };
  }
  if (lookup.resolveArtifact) {
    const found = lookup.resolveArtifact(artifactId);
    if (found) {
      const check = checkArtifactIdentity(found);
      return check.ok && check.artifactId === artifactId
        ? { status: "resolved", artifactId, artifact: found }
        : { status: "invalid", artifactId, detail: "the resolver's copy does not verify as that identity" };
    }
    if (!lookup.workspaceRoot) return { status: "missing", artifactId, detail: "not found by the given resolver" };
  }
  if (!lookup.workspaceRoot) {
    return { status: "unresolved", artifactId, detail: "no workspace root or resolver was given, so no workspace was searched" };
  }
  try {
    return { status: "resolved", artifactId, artifact: resolveArtifactSync(lookup.workspaceRoot, { artifact: artifactId }).artifact };
  } catch (e: any) {
    if (e?.code === "ARTIFACT_NOT_FOUND") return { status: "missing", artifactId };
    return { status: "invalid", artifactId, detail: `${e?.code ?? "RESOLVE_FAILED"}: ${e?.message ?? String(e)}` };
  }
}

export interface LineageChainLink {
  /** The artifact this link names (the content hash of a resolved copy; the reference for one that is not). */
  artifactId: string | null;
  schema?: string;
  /** "here" is the artifact the chain starts from; the others are its ancestors, as looked up. */
  status: "here" | Exclude<ParentStatus, "root">;
  detail?: string;
}

export interface ResolvedLineageChain {
  /** From the artifact (first) up to the farthest ancestor reached (last). */
  links: LineageChainLink[];
  /** True only when every ancestor was resolved up to a root, every link holds, and the root is the one declared. */
  complete: boolean;
  /** What breaks the chain: a link that does not hold, the declared root not reached, a cycle, too many hops. */
  issues: VerificationIssue[];
}

const MAX_LINEAGE_HOPS = 64;

/** Walks the provenance chain of an artifact through the workspace store (see `ResolvedLineageChain`). */
export function resolveLineageChain(artifact: any, lookup: ParentLookup = {}, maxHops = MAX_LINEAGE_HOPS): ResolvedLineageChain {
  const identityOf = (a: any): string | null => {
    const check = checkArtifactIdentity(a);
    return check.ok ? check.artifactId : typeof a?.contentHash === "string" ? a.contentHash : null;
  };
  const links: LineageChainLink[] = [
    { artifactId: identityOf(artifact), ...(typeof artifact?.schema === "string" ? { schema: artifact.schema } : {}), status: "here" }
  ];
  const issues: VerificationIssue[] = [];
  const visited = new Set<string>(links[0]!.artifactId ? [links[0]!.artifactId] : []);
  let current: any = artifact;
  for (let hop = 0; ; hop++) {
    const parent = resolveParentReference(current, lookup);
    if (parent.status === "root") break;
    if (hop >= maxHops) {
      issues.push({ code: "LINEAGE_DEPTH_EXCEEDED", severity: "error", message: `The chain exceeded ${maxHops} parent hops without reaching a root` });
      return { links, complete: false, issues };
    }
    if (parent.status !== "resolved") {
      links.push({ artifactId: parent.artifactId ?? null, status: parent.status, ...(parent.detail ? { detail: parent.detail } : {}) });
      return { links, complete: false, issues };
    }
    const parentId = parent.artifactId!;
    if (visited.has(parentId)) {
      issues.push({ code: "LINEAGE_CYCLE_DETECTED", severity: "error", message: `Lineage cycle detected at artifact ${parentId}` });
      return { links, complete: false, issues };
    }
    visited.add(parentId);
    links.push({ artifactId: parentId, ...(typeof parent.artifact?.schema === "string" ? { schema: parent.artifact.schema } : {}), status: "resolved" });
    for (const issue of verifyLineage(current, parent.artifact, { strict: true }).issues) {
      if (issue.severity === "error" || issue.severity === "critical") issues.push(issue);
    }
    current = parent.artifact;
  }
  // The root reached must be the root the artifact declares: a version-5 child names its root's artifactId; a legacy
  // chain carries the root's own declared rootArtifactId down (the historical two-pass shape).
  const declaredRoot = artifact?.lineage?.rootArtifactId;
  const reachedRoot = links[links.length - 1]!.artifactId;
  const rootNames = new Set(
    [reachedRoot, current?.lineage?.artifactId, current?.lineage?.rootArtifactId].filter(
      (s): s is string => typeof s === "string" && s.length > 0
    )
  );
  if (links.length > 1 && typeof declaredRoot === "string" && declaredRoot.length > 0 && !rootNames.has(declaredRoot)) {
    issues.push({
      code: "ROOT_ARTIFACT_ID_MISMATCH",
      severity: "error",
      message: `The chain reaches root ${String(reachedRoot)}, but the artifact declares root ${declaredRoot}`
    });
  }
  return { links, complete: issues.length === 0, issues };
}
