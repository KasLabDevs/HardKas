import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION, MIN_HASH_VERSION, readDeclaredHashVersion } from "./canonical.js";
import { writeFileAtomic } from "@hardkas/core";
import { assertSafeFileId, codedError as storeError, schemaFilePrefix } from "./file-id.js";
import { LineageError } from "./lineage-error.js";
import { ReceiptLookupError } from "./receipt-lookup-error.js";
import {
  ARTIFACT_ID_PATTERN,
  ArtifactResolveError,
  enumerateWorkspaceArtifactsSync,
  looksLikePath,
  parseUntypedLookup,
  resolveArtifactSync
} from "./resolve.js";

// Wave 10 · RECEIPT-1 / Wave 1.2 · IC-5′: the txId namespace is answered by the
// verified resolver (`TX_NAMESPACE_SCHEMAS`); L2 (Igra) receipts stay excluded.

// Wave 6 · LINEAGE-1: bounded parent-hop count. Depth is measured as the
// number of parent lookups (not nodes) — a chain of receipt→signed→plan→ROOT
// consumes 3 hops (receipt→signed, signed→plan, plan→root-terminator). The
// resolver terminates on the (MAX + 1)-th hop with LINEAGE_DEPTH_EXCEEDED.
const MAX_LINEAGE_PARENT_HOPS = 64;

const bigIntReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

const STORE_ID_FIELDS = ["artifactId", "contentHash", "planId", "signedId", "txId"] as const;

/** True when `candidate` is `root` itself or lies beneath it. */
function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function resolveStoreId(artifact: any): string {
  for (const field of STORE_ID_FIELDS) {
    const value = artifact?.[field];
    if (value === undefined || value === null || value === "") continue;
    return assertSafeFileId(field, value);
  }
  return Date.now().toString(36);
}

export class ProjectArtifactStore {
  private artifactsDir: string;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.artifactsDir = path.join(workspaceRoot, ".hardkas", "artifacts");
  }

  /** Refuses any path outside the workspace, following symlinks when the path exists. */
  private async assertInsideWorkspace(id: string, candidate: string): Promise<void> {
    const roots = [this.workspaceRoot];
    try {
      roots.push(await fs.realpath(this.workspaceRoot));
    } catch (e) {}
    let target = candidate;
    try {
      target = await fs.realpath(candidate);
    } catch (e) {}
    if (roots.some((root) => isWithin(root, target))) return;
    throw storeError("PATH_TRAVERSAL", `Artifact with ID ${id} is outside the workspace boundary`);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (e) {}
  }

  async writeArtifact(artifact: any): Promise<string> {
    // Identifier safety first (path traversal is refused before anything else).
    const id = resolveStoreId(artifact);
    // IC-1′.3–4 / N3: the store never completes or reshapes an artifact. It must
    // declare the hash version it was hashed with, and its body must still hash
    // to the identity it claims.
    const declaredVersion = readDeclaredHashVersion(artifact);
    if (declaredVersion === null) {
      throw storeError(
        "HASH_VERSION_MISSING",
        `Refusing to store ${String(artifact?.schema ?? "artifact")}: hashVersion must be an integer between ${MIN_HASH_VERSION} and ${CURRENT_HASH_VERSION}, written by the producer before hashing (got ${JSON.stringify(artifact?.hashVersion)})`
      );
    }
    if (typeof artifact?.contentHash === "string" && artifact.contentHash.length > 0) {
      const recomputed = calculateContentHash(artifact, declaredVersion);
      if (recomputed !== artifact.contentHash) {
        throw storeError(
          "ARTIFACT_HASH_MISMATCH",
          `Refusing to store ${String(artifact.schema ?? "artifact")}: body hashes to ${recomputed} under hashVersion ${declaredVersion} but declares ${artifact.contentHash} (a field changed after hashing)`
        );
      }
    }
    const prefix = schemaFilePrefix(artifact.schema, 1, "artifact");
    let subDir = "misc";
    if (typeof artifact.schema === "string") {
      const s = artifact.schema.toLowerCase();
      if (s.includes("txplan")) subDir = "plans";
      else if (s.includes("signedtx")) subDir = "signed";
      else if (s.includes("txreceipt")) subDir = "receipts";
      else if (s.includes("lineage")) subDir = "lineage";
    }

    const dirPath = path.join(this.artifactsDir, subDir);
    await this.ensureDir(dirPath);

    const filename = `${prefix}-${id}.json`;
    const targetPath = path.join(dirPath, filename);
    if (path.dirname(targetPath) !== dirPath) {
      throw storeError("PATH_TRAVERSAL", `Artifact file name ${filename} escapes ${dirPath}`);
    }

    const content = JSON.stringify(artifact, bigIntReplacer, 2) + "\n";
    await writeFileAtomic(targetPath, content);
    
    return targetPath;
  }

  /**
   * True when `id` (a contained path or a 64-hex artifactId) resolves to a verified
   * artifact. A label needs its namespace and is refused (NAMESPACE_REQUIRED).
   */
  async exists(id: string): Promise<boolean> {
    try {
      await this.readArtifact(id);
      return true;
    } catch (e) {
      if (e instanceof ArtifactResolveError && (e.code === "ARTIFACT_NOT_FOUND" || e.code === "RECEIPT_NOT_FOUND")) return false;
      if ((e as any)?.code === "PATH_TRAVERSAL") return false;
      throw e;
    }
  }

  /**
   * Wave 1.2 · IC-5′: reads a contained workspace path or a 64-hex artifactId
   * (the recomputed contentHash). Both are verified before they are returned.
   * Labels (`planId`, `signedId`), txIds and workflowIds are refused with
   * NAMESPACE_REQUIRED: use `resolveArtifact(root, { plan | signed | tx | workflow })`.
   *
   * Paths are relative to the WORKSPACE ROOT (never process.cwd(), IC-5′.7) and
   * are checked against the boundary whether or not they exist, so a traversal
   * attempt is reported as such (PATH_TRAVERSAL) instead of as a missing artifact.
   */
  async readArtifact(id: string): Promise<unknown> {
    if (looksLikePath(id)) {
      const candidate = path.isAbsolute(id) ? path.resolve(id) : path.resolve(this.workspaceRoot, id);
      await this.assertInsideWorkspace(id, candidate);
      return resolveArtifactSync(this.workspaceRoot, { artifact: id }).artifact;
    }
    return resolveArtifactSync(this.workspaceRoot, parseUntypedLookup(id)).artifact;
  }

  /**
   * Wave 10 · RECEIPT-1 · exact receipt lookup by `.txId` field.
   *
   * The historical implementation delegated to `readArtifact(txId)`, which
   * ultimately performed a filename-substring search (removed in Wave 1.2 of
   * the rc.23 remediation). That resolver keyed on the artifact's own
   * identity token (typically `artifactId` or `contentHash`), NOT the
   * receipt's Kaspa consensus `.txId` field, so real-node receipts (whose
   * filenames encode `artifactId`, a different 64-hex string from `txId`)
   * silently returned `"not found in store"` even though the receipt was
   * present on disk. A subset of simulator receipts happened to resolve
   * only because their filename identity coincided with `.txId`.
   *
   * The correct algorithm — already proven by
   * `packages/localnet/src/receipts.ts::loadSimulatedReceipt` — is:
   *   1. Enumerate every canonical artifact under `.hardkas/artifacts/`.
   *   2. Retain only those whose declared schema is an L1 receipt schema
   *      (`hardkas.txReceipt` or `hardkas.txReceipt.v1`) checked against
   *      BOTH the top-level `.schema` field AND `.schemaVersion` (some
   *      simulator writers set the latter instead of the former; a valid
   *      receipt is one that carries the schema string in either slot).
   *   3. Retain only those whose `.txId` is a non-empty string that
   *      exactly equals the requested `txId` (byte-for-byte, no
   *      normalisation — `txId` is contractually `z.string()` and can be
   *      lowercase 64-hex, a `simtx_failed_*` marker, or any deterministic
   *      simulator id; imposing a shape here would break legitimate
   *      lookups).
   *   4. Zero matches → `RECEIPT_NOT_FOUND` typed error.
   *   5. Exactly one match → return it.
   *   6. Multiple matches → collapse ONLY if every match carries a
   *      non-empty `.contentHash` string AND all values are identical
   *      (i.e., duplicate copies of the same evidence). Any absent /
   *      empty `.contentHash`, or any structural disagreement, throws
   *      `RECEIPT_AMBIGUOUS_CONFLICT` with the observed identities.
   *      This guard specifically avoids collapsing two distinct artifacts
   *      that both happen to omit `contentHash` under the accidental
   *      identity `undefined === undefined`.
   *
   * The signature (`(string) => Promise<unknown>`) is preserved so the
   * existing sole consumer (`packages/cli/src/runners/tx-receipt-runner.ts`)
   * continues to work unchanged; typed errors now propagate to the CLI's
   * top-level renderer via Wave 8's owner-of-serialisation model.
   */
  async findReceiptByTxId(txId: string): Promise<unknown> {
    // Wave 1.2 · IC-5′.4–.5: every candidate is verified (declared version,
    // claimed identity) before it is returned; identical copies collapse;
    // distinct verified receipts for one txId are a conflict; an invalid
    // candidate fails the lookup instead of being skipped.
    try {
      return resolveArtifactSync(this.workspaceRoot, { tx: txId }).artifact;
    } catch (e) {
      if (e instanceof ArtifactResolveError) {
        const code =
          e.code === "RECEIPT_AMBIGUOUS_CONFLICT" || e.code === "CANDIDATE_INVALID"
            ? e.code
            : "RECEIPT_NOT_FOUND";
        throw new ReceiptLookupError(code, e.message, {
          txId,
          workspaceRoot: this.workspaceRoot,
          ...(e.context?.paths ? { paths: String((e.context.paths as string[]).join("; ")) } : {})
        });
      }
      throw e;
    }
  }

  /**
   * Wave 6 · LINEAGE-1 · canonical parent resolution.
   *
   * Precedence:
   *   1. `lineage.parentArtifactId` is authoritative IF the `lineage` object
   *      is present AND carries a `parentArtifactId` key. An empty string is
   *      an EXPLICIT root marker and MUST NOT fall through to legacy fields.
   *   2. Legacy fallback applies ONLY when the canonical parent field is
   *      genuinely absent (the artifact predates the Wave-1 lineage block).
   *      Fallback order: top-level `parentArtifactId`, then `sourceSignedId`,
   *      then `sourcePlanId`.
   *   3. Self-identifiers (`planId`, `signedId`, `receiptId`, `txId`) are
   *      NEVER treated as parents.
   *
   * Returns undefined when the artifact has no upward pointer (root).
   */
  private static getParentIdCandidate(artifact: any): string | undefined {
    // Wave 1.2 · IC-5′.6: a parent is only ever the authenticated
    // lineage.parentArtifactId. Labels (`sourceSignedId`, `sourcePlanId`) never
    // resolve a persisted reference; a top-level `parentArtifactId` is accepted only
    // as a 64-hex artifactId (pre-lineage artifacts).
    const lineage = artifact?.lineage;
    if (lineage && typeof lineage === "object" && "parentArtifactId" in lineage) {
      const canonical = lineage.parentArtifactId;
      if (typeof canonical !== "string" || canonical.length === 0) {
        // Explicit root marker (or non-string). Do NOT fall through.
        return undefined;
      }
      return canonical;
    }
    if (typeof artifact?.parentArtifactId === "string" && ARTIFACT_ID_PATTERN.test(artifact.parentArtifactId)) {
      return artifact.parentArtifactId;
    }
    return undefined;
  }

  /**
   * Wave 6 · LINEAGE-1 · deterministic identity for visited-set membership.
   *
   * Prefer `lineage.artifactId` (canonical, content-addressed). If absent,
   * fall back to the artifact's `contentHash`. If neither is present, use
   * the resolved absolute filesystem path — supplied by the caller because
   * legacy artifacts identified only by planId/signedId etc. must not have
   * their self-identifier promoted to a canonical identity.
   */
  private static visitedIdentity(artifact: any, resolvedPath: string): string {
    const canonical = artifact?.lineage?.artifactId;
    if (typeof canonical === "string" && canonical.length > 0) {
      return `id:${canonical}`;
    }
    const contentHash = artifact?.contentHash;
    if (typeof contentHash === "string" && contentHash.length > 0) {
      return `hash:${contentHash}`;
    }
    return `path:${resolvedPath}`;
  }

  /**
   * Locate the on-disk path for a resolved artifact so the visited-set can
   * key on a stable identity even when neither canonical nor contentHash is
   * present. Same verified resolver as readArtifact (Wave 1.2).
   */
  private async pathOf(idOrPath: string): Promise<string> {
    try {
      return resolveArtifactSync(this.workspaceRoot, parseUntypedLookup(idOrPath)).path;
    } catch {
      return `unresolved:${idOrPath}`;
    }
  }

  async resolveLineage(id: string): Promise<any[]> {
    const rootArtifact = await this.readArtifact(id);
    const rootPath = await this.pathOf(id);
    const lineage: any[] = [rootArtifact];

    const visited = new Set<string>();
    visited.add(ProjectArtifactStore.visitedIdentity(rootArtifact, rootPath));

    let current: any = rootArtifact;
    // hops counts PARENT lookups — a chain of N nodes consumes N parent hops
    // (the last one returns undefined and terminates the loop). Depth is
    // exhausted iff we perform more than MAX_LINEAGE_PARENT_HOPS lookups
    // WITHOUT terminating. That is distinct from a cycle: a cycle would
    // trigger LINEAGE_CYCLE_DETECTED via the visited set first.
    for (let hops = 0; hops <= MAX_LINEAGE_PARENT_HOPS; hops++) {
      const parentId = ProjectArtifactStore.getParentIdCandidate(current);
      if (parentId === undefined) return lineage;

      if (hops === MAX_LINEAGE_PARENT_HOPS) {
        throw new LineageError(
          "LINEAGE_DEPTH_EXCEEDED",
          `Lineage exceeded ${MAX_LINEAGE_PARENT_HOPS} parent hops without reaching root`,
          {
            maxParentHops: String(MAX_LINEAGE_PARENT_HOPS),
            lastParentId: parentId
          }
        );
      }

      let parent: any;
      let parentPath: string;
      try {
        parent = await this.readArtifact(parentId);
        parentPath = await this.pathOf(parentId);
      } catch {
        // Preserve pre-Wave-6 missing-parent behavior: swallow the read
        // failure and return the partial lineage. Missing-evidence policy
        // is intentionally NOT redesigned in this wave (see LINEAGE-1
        // authorization Section E).
        return lineage;
      }

      const parentIdentity = ProjectArtifactStore.visitedIdentity(parent, parentPath);
      if (visited.has(parentIdentity)) {
        throw new LineageError(
          "LINEAGE_CYCLE_DETECTED",
          `Lineage cycle detected at artifact ${parentIdentity}`,
          {
            repeatedIdentity: parentIdentity,
            parentId
          }
        );
      }
      visited.add(parentIdentity);

      lineage.unshift(parent);
      current = parent;
    }

    // Loop bound was hops <= MAX which returns/throws before falling through.
    // This return is unreachable in practice but preserves the type contract.
    return lineage;
  }

  async enumerateCanonicalArtifacts(): Promise<Array<{
    path: string;
    relativeSubpath: string;
    subDir: string;
    artifact: any;
    id: string;
    schema?: string;
    contentHash?: string;
  }>> {
    // Wave 1.2: one enumerator shared with the resolver (containment by real path,
    // canonical subdirectories, deduplication, stable order).
    return enumerateWorkspaceArtifactsSync(this.workspaceRoot).map((e) => {
      const artifact: any = e.artifact;
      const id =
        artifact.artifactId ||
        artifact.contentHash ||
        artifact.planId ||
        artifact.signedId ||
        artifact.txId ||
        path.basename(e.path, ".json");
      return {
        path: e.path,
        relativeSubpath: e.relativeSubpath,
        subDir: e.subDir,
        artifact,
        id,
        schema: artifact.schema,
        contentHash: artifact.contentHash
      };
    });
  }

  async queryArtifacts(query: { schema?: string }): Promise<any[]> {
    const entries = await this.enumerateCanonicalArtifacts();
    if (!query.schema) return entries.map(e => e.artifact);
    return entries.filter(e => e.schema === query.schema).map(e => e.artifact);
  }
}
