import fs from "node:fs/promises";
import path from "node:path";
import { ProjectArtifactStore } from "./store.js";

// -----------------------------------------------------------------------------
// Wave 5 · DEF-17 · Evidence Discoverability
//
// Single canonical CLI-facing artifact identity resolver. Deliberately narrow
// contract:
//
//   1. exact artifact file path (absolute or workspace-relative);
//   2. exact 64-hex artifactId (as it appears in artifact.lineage.artifactId).
//
// Everything else is rejected with a typed error. No fuzzy resolution, no
// first-match, no partial hashes, no txId, no planId, no signedId, no
// workflowId, no implicit contentHash semantics.
//
// contentHash-only artifacts (e.g. snapshots that carry no lineage.artifactId)
// are intentionally NOT ID-resolvable through this façade; they remain
// path-resolvable. That distinction is enforced by regression.
//
// This façade does NOT modify:
//   * ProjectArtifactStore.findArtifactPathById (legacy substring resolver)
//   * ProjectArtifactStore.findReceiptByTxId    (latent-broken txId lookup)
//   * ProjectArtifactStore.readArtifact         (mixed path/id semantics)
// Those keep their existing contracts for existing internal callers. Wave 5
// only tightens the CLI seam that DISCOVERY-1 identified as leaky.
// -----------------------------------------------------------------------------

export type ArtifactHandleErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_AMBIGUOUS"
  | "ARTIFACT_INPUT_IS_DIRECTORY"
  | "ARTIFACT_INPUT_UNRECOGNIZED"
  | "ARTIFACT_PATH_OUTSIDE_WORKSPACE"
  | "ARTIFACT_READ_FAILED";

export class ArtifactHandleError extends Error {
  readonly code: ArtifactHandleErrorCode;
  readonly context?: Record<string, string>;

  constructor(
    code: ArtifactHandleErrorCode,
    message: string,
    context?: Record<string, string>
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
  /** Canonical artifactId from artifact.lineage.artifactId when present. */
  readonly artifactId?: string;
  /** Which input form resolved the handle. */
  readonly resolvedBy: "path" | "artifactId";
}

const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/;

/** Path-shaped tokens contain a separator, start with `.` or `..`, or are absolute. */
function looksLikePath(input: string): boolean {
  return (
    path.isAbsolute(input) ||
    /[\\/]/.test(input) ||
    input === "." ||
    input === ".." ||
    input.startsWith("./") ||
    input.startsWith(".\\") ||
    input.startsWith("../") ||
    input.startsWith("..\\")
  );
}

/** True when `candidate` is `root` itself or lies beneath it. */
function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

async function resolveByPath(
  input: string,
  workspaceRoot: string
): Promise<ArtifactHandle> {
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);
  // Workspace-relative resolution is anchored to workspaceRoot, NOT process.cwd().
  // This is the entire reason the CLI's ad-hoc scans behaved differently
  // depending on where the user invoked the command; the façade fixes it.
  const candidate = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(absoluteWorkspaceRoot, input);

  const workspaceRoots = [absoluteWorkspaceRoot];
  try {
    workspaceRoots.push(await fs.realpath(absoluteWorkspaceRoot));
  } catch {}

  let realCandidate = candidate;
  try {
    realCandidate = await fs.realpath(candidate);
  } catch {}

  const contained = workspaceRoots.some((root) => isWithin(root, realCandidate));
  if (!contained) {
    throw new ArtifactHandleError(
      "ARTIFACT_PATH_OUTSIDE_WORKSPACE",
      `Artifact path is outside the workspace: ${input}`,
      { input, workspaceRoot: absoluteWorkspaceRoot }
    );
  }

  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch {
    throw new ArtifactHandleError(
      "ARTIFACT_NOT_FOUND",
      `Artifact file does not exist: ${input}`,
      { input }
    );
  }

  if (stat.isDirectory()) {
    throw new ArtifactHandleError(
      "ARTIFACT_INPUT_IS_DIRECTORY",
      `Artifact input is a directory, not a file: ${input}`,
      { input }
    );
  }

  if (!stat.isFile()) {
    throw new ArtifactHandleError(
      "ARTIFACT_NOT_FOUND",
      `Artifact path is not a regular file: ${input}`,
      { input }
    );
  }

  let raw: string;
  try {
    raw = await fs.readFile(candidate, "utf-8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  } catch (e: any) {
    throw new ArtifactHandleError(
      "ARTIFACT_READ_FAILED",
      `Could not read artifact file: ${input}: ${e?.message ?? String(e)}`,
      { input }
    );
  }

  let artifact: any;
  try {
    artifact = JSON.parse(raw);
  } catch (e: any) {
    throw new ArtifactHandleError(
      "ARTIFACT_READ_FAILED",
      `Artifact file is not valid JSON: ${input}: ${e?.message ?? String(e)}`,
      { input }
    );
  }

  const artifactId: string | undefined =
    typeof artifact?.lineage?.artifactId === "string"
      ? artifact.lineage.artifactId
      : undefined;

  return {
    path: candidate,
    artifact,
    ...(artifactId !== undefined ? { artifactId } : {}),
    resolvedBy: "path"
  };
}

async function resolveByArtifactId(
  input: string,
  workspaceRoot: string
): Promise<ArtifactHandle> {
  const store = new ProjectArtifactStore(workspaceRoot);
  // Enumerate canonically and match ONLY on the explicit lineage.artifactId
  // field. Filename substring matching is deliberately not used; snapshots
  // that carry only contentHash are therefore not ID-resolvable, which is
  // the intended contract.
  const entries = await store.enumerateCanonicalArtifacts();
  const matches = entries.filter(
    (e) => e.artifact?.lineage?.artifactId === input
  );

  if (matches.length === 0) {
    throw new ArtifactHandleError(
      "ARTIFACT_NOT_FOUND",
      `No artifact with lineage.artifactId === ${input} found in workspace`,
      { input }
    );
  }
  if (matches.length > 1) {
    throw new ArtifactHandleError(
      "ARTIFACT_AMBIGUOUS",
      `Multiple artifacts share lineage.artifactId === ${input} in workspace`,
      {
        input,
        matches: matches.map((m) => m.path).join(", ")
      }
    );
  }

  const hit = matches[0]!;
  return {
    path: hit.path,
    artifact: hit.artifact,
    artifactId: input,
    resolvedBy: "artifactId"
  };
}

/**
 * Resolve an artifact from the two accepted CLI-facing identity forms.
 *
 * Accepted:
 *   - absolute or workspace-relative filesystem path to a .json artifact file
 *   - exact 64-hex lineage.artifactId
 *
 * Anything else throws a typed ArtifactHandleError. See the file header
 * for the full contract.
 */
export async function resolveArtifactHandle(
  input: string,
  workspaceRoot: string
): Promise<ArtifactHandle> {
  if (typeof input !== "string" || input.length === 0) {
    throw new ArtifactHandleError(
      "ARTIFACT_INPUT_UNRECOGNIZED",
      "Artifact input must be a non-empty string"
    );
  }
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0) {
    throw new ArtifactHandleError(
      "ARTIFACT_INPUT_UNRECOGNIZED",
      "workspaceRoot must be a non-empty string"
    );
  }

  if (looksLikePath(input)) {
    return resolveByPath(input, workspaceRoot);
  }

  if (ARTIFACT_ID_PATTERN.test(input)) {
    return resolveByArtifactId(input, workspaceRoot);
  }

  throw new ArtifactHandleError(
    "ARTIFACT_INPUT_UNRECOGNIZED",
    `Artifact input is neither a workspace path nor a 64-hex artifactId: ${input}`,
    { input }
  );
}
