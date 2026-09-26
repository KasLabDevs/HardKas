import fs from "node:fs";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/core";
import {
  CURRENT_HASH_VERSION,
  calculateContentHash,
  readDeclaredHashVersion
} from "./canonical.js";
import type { AuthScope, VerificationIssue } from "./verify.js";

// -----------------------------------------------------------------------------
// Wave 1.2 · Closure Pack IC-5′ (Q3-II) · verified, namespaced artifact resolution
//
//   .1  identity = the recomputed contentHash (equal to lineage.artifactId when a
//       lineage exists);
//   .2  explicit namespaces: artifact (artifactId or contained path), plan (planId),
//       signed (signedId), tx (txId → submissions, never the signed), workflow
//       (workflowId → correlation results). An untyped input is only a contained
//       path or a 64-hex artifactId; anything else → NAMESPACE_REQUIRED with the
//       exact replacement (D-Q3.a: no deprecation period, no ambiguous behaviour);
//   .3  no auto-detection between namespaces, no fallback chains;
//   .4  every candidate is verified before it is returned: recomputed with the
//       version it declares, compared with the identity it claims, and its derived
//       label is checked. An invalid candidate FAILS the lookup (CANDIDATE_INVALID);
//       it is never skipped silently;
//   .5  ≥2 distinct valid candidates → REFERENCE_AMBIGUOUS / LABEL_AMBIGUOUS /
//       RECEIPT_AMBIGUOUS_CONFLICT with the list; identical copies collapse;
//   .7  paths are workspace-relative and contained, never relative to process.cwd();
//   IC-7.2/.3: a top-level `artifactId` is NOT an identity claim (P7 / AUD-10).
//
// The verification here is exactly IC-5′.4 (hash under the declared version and
// label derivation), not the full schema validation: a lookup answers "which file
// IS this identity", schema conformance is the verifier's job (IC-4′).
// -----------------------------------------------------------------------------

export type LookupNamespace = "artifact" | "plan" | "signed" | "tx" | "workflow";

export type LookupInput =
  | { artifact: string }
  | { plan: string }
  | { signed: string }
  | { tx: string }
  | { workflow: string };

export type ResolveErrorCode =
  | "NAMESPACE_REQUIRED"
  | "ARTIFACT_NOT_FOUND"
  | "RECEIPT_NOT_FOUND"
  | "CANDIDATE_INVALID"
  | "REFERENCE_AMBIGUOUS"
  | "LABEL_AMBIGUOUS"
  | "RECEIPT_AMBIGUOUS_CONFLICT"
  | "ARTIFACT_INPUT_UNRECOGNIZED"
  | "ARTIFACT_INPUT_IS_DIRECTORY"
  | "ARTIFACT_PATH_OUTSIDE_WORKSPACE"
  | "ARTIFACT_READ_FAILED";

export class ArtifactResolveError extends Error {
  readonly code: ResolveErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(code: ResolveErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "ArtifactResolveError";
    this.code = code;
    if (context !== undefined) this.context = context;
  }
}

export type LookupClassification =
  | { kind: "path" }
  | { kind: "artifactId" }
  | { kind: "namespaced"; namespace: Exclude<LookupNamespace, "artifact">; replacement: LookupInput }
  | { kind: "unknown" };

export interface ResolvedArtifact {
  /** Parsed artifact (the file's content, unmodified). */
  artifact: any;
  /** Canonical identity: the hash recomputed under the declared version. */
  artifactId: string;
  /** Absolute path of the returned copy. */
  path: string;
  /** What the declared hash version authenticated (D-Q1.e). */
  authScope: AuthScope;
  namespace: LookupNamespace;
  resolvedBy: "path" | "artifactId" | "label" | "txId" | "workflowId";
  /** Every identical copy found (same identity), the first is `path`. */
  copies: string[];
}

export interface WorkspaceArtifactEntry {
  path: string;
  relativeSubpath: string;
  subDir: string;
  artifact: any;
}

export const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/;

/** Schemas the `tx` namespace answers with (submissions; observations arrive in Wave 2). */
export const TX_NAMESPACE_SCHEMAS: ReadonlySet<string> = new Set([
  HardkasSchemas.TxReceipt,
  HardkasSchemas.TxReceiptV1,
  HardkasSchemas.TxSubmissionV1
]);

// Wave 2(a): `observations` holds `hardkas.txObservation.v1` (IC-2′.3), N per txId by design.
export const CANONICAL_STORE_SUBDIRS = ["plans", "signed", "receipts", "observations", "lineage", "evidences", "misc"] as const;

/** Path-shaped tokens contain a separator, start with `.` or `..`, or are absolute. */
export function looksLikePath(input: string): boolean {
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

export function classifyLookupInput(input: string): LookupClassification {
  if (typeof input !== "string" || input.length === 0) return { kind: "unknown" };
  if (looksLikePath(input)) return { kind: "path" };
  if (ARTIFACT_ID_PATTERN.test(input)) return { kind: "artifactId" };
  if (/^plan-[0-9a-f]{16}$/.test(input)) return { kind: "namespaced", namespace: "plan", replacement: { plan: input } };
  if (/^signed-[0-9a-f]{16}$/.test(input)) return { kind: "namespaced", namespace: "signed", replacement: { signed: input } };
  if (/^wf_[0-9a-f]{16}$/.test(input)) return { kind: "namespaced", namespace: "workflow", replacement: { workflow: input } };
  if (/^(simulated-.+-tx|simtx_[0-9a-z_]+|synthetic-[0-9a-f]{64})$/i.test(input)) {
    return { kind: "namespaced", namespace: "tx", replacement: { tx: input } };
  }
  return { kind: "unknown" };
}

export function namespaceOf(input: LookupInput): LookupNamespace {
  if ("artifact" in input) return "artifact";
  if ("plan" in input) return "plan";
  if ("signed" in input) return "signed";
  if ("tx" in input) return "tx";
  return "workflow";
}

export function lookupValue(input: LookupInput): string {
  return (input as Record<string, string>)[namespaceOf(input)]!;
}

/**
 * Turns an untyped string into a lookup: a contained path or a 64-hex artifactId
 * become `{ artifact }`; anything else needs its namespace (NAMESPACE_REQUIRED).
 */
export function parseUntypedLookup(input: string): LookupInput {
  const cls = classifyLookupInput(input);
  if (cls.kind === "path" || cls.kind === "artifactId") return { artifact: input };
  const hint =
    cls.kind === "namespaced"
      ? `use ${JSON.stringify(cls.replacement)} (CLI: --${cls.namespace} ${input})`
      : "use { artifact: <64-hex artifactId | workspace path> } or one of { plan | signed | tx | workflow }";
  throw new ArtifactResolveError(
    "NAMESPACE_REQUIRED",
    `Lookup input "${input}" is neither a workspace path nor a 64-hex artifactId; ${hint}`,
    { input, ...(cls.kind === "namespaced" ? { namespace: cls.namespace, replacement: cls.replacement } : {}) }
  );
}

function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function realpathOr(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Every parseable `.json` artifact under `<workspaceRoot>/.hardkas/artifacts` (root
 * and canonical subdirectories), contained by real path, deduplicated, in a stable
 * order. Unparseable files are not artifacts and cannot claim an identity.
 */
export function enumerateWorkspaceArtifactsSync(workspaceRoot: string): WorkspaceArtifactEntry[] {
  const artifactsDir = path.join(path.resolve(workspaceRoot), ".hardkas", "artifacts");
  const resolvedBase = realpathOr(artifactsDir);
  const entries: WorkspaceArtifactEntry[] = [];
  const seen = new Set<string>();

  const scan = (dirPath: string, subDir: string) => {
    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const real = path.resolve(realpathOr(path.join(dirPath, file)));
      const rel = path.relative(resolvedBase, real);
      const contained = rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
      if (!contained || seen.has(real)) continue;
      let artifact: unknown;
      try {
        let content = fs.readFileSync(real, "utf-8");
        if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
        artifact = JSON.parse(content);
      } catch {
        continue;
      }
      if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(real);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      seen.add(real);
      entries.push({ path: real, relativeSubpath: rel.replace(/\\/g, "/"), subDir, artifact });
    }
  };

  scan(artifactsDir, "root");
  for (const sub of CANONICAL_STORE_SUBDIRS) scan(path.join(artifactsDir, sub), sub);
  entries.sort((a, b) => (a.relativeSubpath < b.relativeSubpath ? -1 : a.relativeSubpath > b.relativeSubpath ? 1 : 0));
  return entries;
}

// -----------------------------------------------------------------------------
// Candidate verification (IC-5′.4)
// -----------------------------------------------------------------------------

type CandidateCheck =
  | { ok: true; artifactId: string; authScope: AuthScope }
  | { ok: false; issues: VerificationIssue[] };

function issue(code: string, message: string): VerificationIssue {
  return { code, severity: "error", message };
}

/**
 * Recomputes the artifact under the version it declares and checks every identity
 * it claims (contentHash, lineage.artifactId) and its derived label. Nothing is
 * inferred: an artifact without a valid hashVersion cannot be an identity.
 */
export function checkArtifactIdentity(artifact: any): CandidateCheck {
  const issues: VerificationIssue[] = [];
  const version = readDeclaredHashVersion(artifact);
  if (version === null) {
    return { ok: false, issues: [issue("HASH_VERSION_INVALID", `hashVersion must be an integer declared by the artifact; got ${JSON.stringify(artifact?.hashVersion)}`)] };
  }
  const recomputed = calculateContentHash(artifact, version);
  if (typeof artifact.contentHash !== "string" || artifact.contentHash.length === 0) {
    issues.push(issue("MISSING_CONTENT_HASH", "Missing contentHash field"));
  } else if (artifact.contentHash !== recomputed) {
    issues.push(issue("ARTIFACT_HASH_MISMATCH", `Hash mismatch: expected ${artifact.contentHash}, got ${recomputed}`));
  }
  const lineageId = artifact?.lineage?.artifactId;
  if (typeof lineageId === "string" && lineageId.length > 0 && lineageId !== recomputed) {
    issues.push(issue("LINEAGE_IDENTITY_MISMATCH", `lineage.artifactId ${lineageId} does not match the recomputed identity ${recomputed}`));
  }
  const schema = typeof artifact.schema === "string" ? artifact.schema : "";
  if (schema.startsWith(HardkasSchemas.TxPlan) && artifact.planId !== undefined && artifact.planId !== `plan-${recomputed.slice(0, 16)}`) {
    issues.push(issue("LABEL_MISMATCH", `planId ${String(artifact.planId)} does not derive from the artifact's content hash`));
  }
  if (schema.startsWith(HardkasSchemas.SignedTx) && artifact.signedId !== undefined && artifact.signedId !== `signed-${recomputed.slice(0, 16)}`) {
    issues.push(issue("LABEL_MISMATCH", `signedId ${String(artifact.signedId)} does not derive from the artifact's content hash`));
  }
  // IC-7.3: a version-5 artifact stores no top-level identity copy.
  if (version === CURRENT_HASH_VERSION && artifact.artifactId !== undefined) {
    issues.push(issue("FORBIDDEN_IDENTITY_FIELD", `hashVersion ${CURRENT_HASH_VERSION} artifacts must not carry a top-level artifactId (got ${JSON.stringify(artifact.artifactId)})`));
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, artifactId: recomputed, authScope: version === CURRENT_HASH_VERSION ? "FULL" : "LEGACY" };
}

function safeRecompute(artifact: any): string | null {
  const version = readDeclaredHashVersion(artifact);
  if (version === null) return null;
  try {
    return calculateContentHash(artifact, version);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

interface VerifiedCandidate {
  entry: WorkspaceArtifactEntry;
  artifactId: string;
  authScope: AuthScope;
}

function resolveByPathSync(input: string, workspaceRoot: string): ResolvedArtifact {
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);
  const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(absoluteWorkspaceRoot, input);
  const roots = [absoluteWorkspaceRoot, realpathOr(absoluteWorkspaceRoot)];
  const realCandidate = realpathOr(candidate);
  if (!roots.some((root) => isWithin(root, realCandidate))) {
    throw new ArtifactResolveError("ARTIFACT_PATH_OUTSIDE_WORKSPACE", `Artifact path is outside the workspace: ${input}`, { input, workspaceRoot: absoluteWorkspaceRoot });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(candidate);
  } catch {
    throw new ArtifactResolveError("ARTIFACT_NOT_FOUND", `Artifact file does not exist: ${input}`, { input });
  }
  if (stat.isDirectory()) {
    throw new ArtifactResolveError("ARTIFACT_INPUT_IS_DIRECTORY", `Artifact input is a directory, not a file: ${input}`, { input });
  }
  if (!stat.isFile()) {
    throw new ArtifactResolveError("ARTIFACT_NOT_FOUND", `Artifact path is not a regular file: ${input}`, { input });
  }
  let artifact: any;
  try {
    let raw = fs.readFileSync(candidate, "utf-8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    artifact = JSON.parse(raw);
  } catch (e: any) {
    throw new ArtifactResolveError("ARTIFACT_READ_FAILED", `Could not read artifact file: ${input}: ${e?.message ?? String(e)}`, { input });
  }
  const check = checkArtifactIdentity(artifact);
  if (!check.ok) {
    throw new ArtifactResolveError(
      "CANDIDATE_INVALID",
      `Artifact at ${input} does not verify: ${check.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`,
      { input, path: candidate, paths: [candidate], issues: check.issues }
    );
  }
  return {
    artifact,
    artifactId: check.artifactId,
    path: candidate,
    authScope: check.authScope,
    namespace: "artifact",
    resolvedBy: "path",
    copies: [candidate]
  };
}

function collect(
  workspaceRoot: string,
  isCandidate: (artifact: any, recomputed: string | null) => boolean,
  extraCheck?: (artifact: any, artifactId: string) => VerificationIssue | null
): { valid: VerifiedCandidate[]; invalid: Array<{ entry: WorkspaceArtifactEntry; issues: VerificationIssue[] }> } {
  const valid: VerifiedCandidate[] = [];
  const invalid: Array<{ entry: WorkspaceArtifactEntry; issues: VerificationIssue[] }> = [];
  for (const entry of enumerateWorkspaceArtifactsSync(workspaceRoot)) {
    const recomputed = safeRecompute(entry.artifact);
    if (!isCandidate(entry.artifact, recomputed)) continue;
    const check = checkArtifactIdentity(entry.artifact);
    if (!check.ok) {
      invalid.push({ entry, issues: check.issues });
      continue;
    }
    const extra = extraCheck ? extraCheck(entry.artifact, check.artifactId) : null;
    if (extra) {
      invalid.push({ entry, issues: [extra] });
      continue;
    }
    valid.push({ entry, artifactId: check.artifactId, authScope: check.authScope });
  }
  return { valid, invalid };
}

function failInvalid(namespace: LookupNamespace, value: string, invalid: Array<{ entry: WorkspaceArtifactEntry; issues: VerificationIssue[] }>): never {
  throw new ArtifactResolveError(
    "CANDIDATE_INVALID",
    `${invalid.length} candidate(s) for ${namespace} "${value}" do not verify and the lookup fails closed: ` +
      invalid.map((c) => `${c.entry.relativeSubpath} [${c.issues.map((i) => i.code).join(", ")}]`).join("; "),
    { namespace, value, paths: invalid.map((c) => c.entry.path), issues: invalid.flatMap((c) => c.issues) }
  );
}

function pick(
  namespace: LookupNamespace,
  value: string,
  resolvedBy: ResolvedArtifact["resolvedBy"],
  found: ReturnType<typeof collect>,
  ambiguityCode: ResolveErrorCode,
  notFoundCode: ResolveErrorCode
): ResolvedArtifact {
  if (found.invalid.length > 0) failInvalid(namespace, value, found.invalid);
  if (found.valid.length === 0) {
    throw new ArtifactResolveError(notFoundCode, `No verified artifact for ${namespace} "${value}" in the workspace`, { namespace, value });
  }
  const groups = new Map<string, VerifiedCandidate[]>();
  for (const c of found.valid) {
    const g = groups.get(c.artifactId);
    if (g) g.push(c);
    else groups.set(c.artifactId, [c]);
  }
  if (groups.size > 1) {
    throw new ArtifactResolveError(
      ambiguityCode,
      `${groups.size} distinct artifacts answer ${namespace} "${value}": ` +
        [...groups.entries()].map(([id, cs]) => `${id} (${cs.map((c) => c.entry.relativeSubpath).join(", ")})`).join("; "),
      { namespace, value, candidates: [...groups.entries()].map(([artifactId, cs]) => ({ artifactId, paths: cs.map((c) => c.entry.path) })) }
    );
  }
  const copies = [...groups.values()][0]!;
  const first = copies[0]!;
  return {
    artifact: first.entry.artifact,
    artifactId: first.artifactId,
    path: first.entry.path,
    authScope: first.authScope,
    namespace,
    resolvedBy,
    copies: copies.map((c) => c.entry.path)
  };
}

const schemaOf = (a: any): string => (typeof a?.schema === "string" ? a.schema : "");

/** Every verified workflow run recorded under `workflowId` (correlation results, IC-5′.2). */
export function resolveWorkflowRunsSync(workspaceRoot: string, workflowId: string): ResolvedArtifact[] {
  const found = collect(workspaceRoot, (a) => schemaOf(a) === HardkasSchemas.WorkflowV1 && a.workflowId === workflowId);
  if (found.invalid.length > 0) failInvalid("workflow", workflowId, found.invalid);
  const byId = new Map<string, VerifiedCandidate[]>();
  for (const c of found.valid) {
    const g = byId.get(c.artifactId);
    if (g) g.push(c);
    else byId.set(c.artifactId, [c]);
  }
  return [...byId.values()].map((copies) => ({
    artifact: copies[0]!.entry.artifact,
    artifactId: copies[0]!.artifactId,
    path: copies[0]!.entry.path,
    authScope: copies[0]!.authScope,
    namespace: "workflow" as const,
    resolvedBy: "workflowId" as const,
    copies: copies.map((c) => c.entry.path)
  }));
}

/**
 * Resolves one artifact. A string input is parsed with `parseUntypedLookup`.
 */
export function resolveArtifactSync(workspaceRoot: string, input: LookupInput | string): ResolvedArtifact {
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0) {
    throw new ArtifactResolveError("ARTIFACT_INPUT_UNRECOGNIZED", "workspaceRoot must be a non-empty string");
  }
  const lookup = typeof input === "string" ? parseUntypedLookup(input) : input;
  const value = lookupValue(lookup);
  if (typeof value !== "string" || value.length === 0) {
    throw new ArtifactResolveError("ARTIFACT_INPUT_UNRECOGNIZED", "Lookup value must be a non-empty string", { lookup });
  }

  if ("artifact" in lookup) {
    if (looksLikePath(value)) return resolveByPathSync(value, workspaceRoot);
    if (!ARTIFACT_ID_PATTERN.test(value)) return resolveArtifactSync(workspaceRoot, parseUntypedLookup(value));
    // IC-5′.1 / IC-7.2: a claim is the declared contentHash, lineage.artifactId or the
    // recomputed identity itself; a top-level `artifactId` never is (P7).
    const found = collect(
      workspaceRoot,
      (a, recomputed) => a.contentHash === value || a?.lineage?.artifactId === value || recomputed === value,
      (_a, artifactId) => (artifactId === value ? null : issue("IDENTITY_CLAIM_MISMATCH", `claims ${value} but hashes to ${artifactId}`))
    );
    return pick("artifact", value, "artifactId", found, "REFERENCE_AMBIGUOUS", "ARTIFACT_NOT_FOUND");
  }
  if ("plan" in lookup) {
    const found = collect(workspaceRoot, (a) => schemaOf(a).startsWith(HardkasSchemas.TxPlan) && a.planId === value);
    return pick("plan", value, "label", found, "LABEL_AMBIGUOUS", "ARTIFACT_NOT_FOUND");
  }
  if ("signed" in lookup) {
    const found = collect(workspaceRoot, (a) => schemaOf(a).startsWith(HardkasSchemas.SignedTx) && a.signedId === value);
    return pick("signed", value, "label", found, "LABEL_AMBIGUOUS", "ARTIFACT_NOT_FOUND");
  }
  if ("tx" in lookup) {
    // Wave 10 kept: the receipt schema may sit in `schema` or, for the simulator's
    // failure writer, in `schemaVersion` only.
    const isReceipt = (a: any) =>
      TX_NAMESPACE_SCHEMAS.has(schemaOf(a)) ||
      (schemaOf(a) === "" && typeof a?.schemaVersion === "string" && TX_NAMESPACE_SCHEMAS.has(a.schemaVersion));
    const found = collect(workspaceRoot, (a) => isReceipt(a) && typeof a.txId === "string" && a.txId === value);
    return pick("tx", value, "txId", found, "RECEIPT_AMBIGUOUS_CONFLICT", "RECEIPT_NOT_FOUND");
  }
  const runs = resolveWorkflowRunsSync(workspaceRoot, value);
  if (runs.length === 0) {
    throw new ArtifactResolveError("ARTIFACT_NOT_FOUND", `No verified workflow run with workflowId "${value}" in the workspace`, { namespace: "workflow", value });
  }
  if (runs.length > 1) {
    throw new ArtifactResolveError(
      "REFERENCE_AMBIGUOUS",
      `${runs.length} distinct workflow runs share workflowId "${value}"; a workflowId correlates runs, it does not name one artifact: ` + runs.map((r) => r.artifactId).join(", "),
      { namespace: "workflow", value, candidates: runs.map((r) => ({ artifactId: r.artifactId, paths: r.copies })) }
    );
  }
  return runs[0]!;
}

export async function resolveArtifact(workspaceRoot: string, input: LookupInput | string): Promise<ResolvedArtifact> {
  return resolveArtifactSync(workspaceRoot, input);
}

export async function resolveWorkflowRuns(workspaceRoot: string, workflowId: string): Promise<ResolvedArtifact[]> {
  return resolveWorkflowRunsSync(workspaceRoot, workflowId);
}
