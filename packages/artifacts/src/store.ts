import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { verifyArtifact } from "./verify.js";
import { writeFileAtomic } from "@hardkas/core";
import { assertSafeFileId, codedError as storeError, schemaFilePrefix } from "./file-id.js";
import { LineageError } from "./lineage-error.js";
import { ReceiptLookupError } from "./receipt-lookup-error.js";

// Wave 10 · RECEIPT-1: schemas recognised by `findReceiptByTxId` as canonical
// L1 receipt shapes carrying `.txId` with kaspa-consensus / simulator
// semantics. L2 (Igra) receipts are deliberately excluded — cross-chain
// txId lookup is a separate contract decision.
const L1_RECEIPT_SCHEMAS: ReadonlySet<string> = new Set([
  "hardkas.txReceipt",
  "hardkas.txReceipt.v1"
]);

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
    const id = resolveStoreId(artifact);
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

  async exists(id: string): Promise<boolean> {
    return (await this.findArtifactPathById(id)) !== null;
  }

  async readArtifact(id: string): Promise<unknown> {
    // Paths are accepted as well as IDs (e.g. `tx receipt ./my-receipt.json`),
    // but only inside the workspace. Anything that names a path is checked
    // against the boundary whether or not it exists, so a traversal attempt is
    // reported as such instead of as a missing artifact.
    const candidate = path.resolve(process.cwd(), id);
    let isFile = false;
    try {
      isFile = (await fs.stat(candidate)).isFile();
    } catch (e) {}
    const looksLikePath = path.isAbsolute(id) || /[\\/]/.test(id) || id === "." || id === "..";

    if (isFile || looksLikePath) {
      await this.assertInsideWorkspace(id, candidate);
    }
    if (isFile) {
      let content = await fs.readFile(candidate, "utf-8");
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      return JSON.parse(content);
    }
    if (looksLikePath) {
      throw new Error(`Artifact with ID ${id} not found in store`);
    }

    const filePath = await this.findArtifactPathById(id);
    if (!filePath) {
      throw new Error(`Artifact with ID ${id} not found in store`);
    }

    let content = await fs.readFile(filePath, "utf-8");
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    return JSON.parse(content);
  }

  /**
   * Wave 10 · RECEIPT-1 · exact receipt lookup by `.txId` field.
   *
   * The historical implementation delegated to `readArtifact(txId)`, which
   * ultimately performs a filename-substring search via
   * `findArtifactPathById`. That resolver keys on the artifact's own
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
    const entries = await this.enumerateCanonicalArtifacts();

    const l1ReceiptMatches = entries.filter((entry) => {
      const artifact: any = entry.artifact;
      if (!artifact) return false;

      const schemaTag =
        (typeof artifact.schema === "string" && artifact.schema) ||
        (typeof artifact.schemaVersion === "string" && artifact.schemaVersion) ||
        "";
      if (!L1_RECEIPT_SCHEMAS.has(schemaTag)) return false;

      return typeof artifact.txId === "string" && artifact.txId === txId;
    });

    if (l1ReceiptMatches.length === 0) {
      throw new ReceiptLookupError(
        "RECEIPT_NOT_FOUND",
        `No L1 receipt artifact with .txId === "${txId}" found in workspace`,
        { txId, workspaceRoot: this.workspaceRoot }
      );
    }

    if (l1ReceiptMatches.length === 1) {
      return l1ReceiptMatches[0]!.artifact;
    }

    // Multiple candidates. Collapse only when every match carries the
    // same non-empty contentHash — that means we have duplicate copies of
    // the same evidence, not conflicting evidence. Missing/empty
    // contentHash on ANY match forces the ambiguity path so two genuinely
    // distinct artifacts can never be collapsed under undefined equality.
    const contentHashes = l1ReceiptMatches.map((m) => {
      const v = (m.artifact as any).contentHash;
      return typeof v === "string" && v.length > 0 ? v : null;
    });
    const allHavePopulatedHash = contentHashes.every((h) => h !== null);
    const allHashesAgree =
      allHavePopulatedHash &&
      contentHashes.every((h) => h === contentHashes[0]);

    if (allHavePopulatedHash && allHashesAgree) {
      return l1ReceiptMatches[0]!.artifact;
    }

    throw new ReceiptLookupError(
      "RECEIPT_AMBIGUOUS_CONFLICT",
      `Multiple L1 receipt artifacts carry .txId === "${txId}" with divergent identities`,
      {
        txId,
        matches: l1ReceiptMatches
          .map((m) => {
            const a: any = m.artifact;
            const ch =
              typeof a.contentHash === "string" && a.contentHash.length > 0
                ? a.contentHash
                : "<absent>";
            return `${m.path} (contentHash=${ch})`;
          })
          .join("; ")
      }
    );
  }

  // Wave 11 · RESOLVER-1 · verify-on-match hardening.
  //
  // Historical failure: `findArtifactPathById` returned the FIRST filename
  // that contained the queried id as a substring. Two collision classes
  // followed:
  //
  //   (a) short-form collision — id "plan-abcd" matched both
  //       `txPlan-plan-abcd.json` (planId === "plan-abcd") and
  //       `txPlan-plan-abcdef.json` (planId === "plan-abcdef"). The wrong
  //       artifact could be returned depending on scan order.
  //   (b) 64-hex prefix collision — a full 64-hex query fell through to a
  //       first-16-hex prefix search. Any file whose filename happened to
  //       carry a coincident 16-hex would silently match, returning the
  //       wrong artifact whose actual `artifactId` bore no relation to
  //       the query.
  //
  // Wave 11 keeps the fast filename-substring descriptor as a candidate
  // filter, but on every candidate the artifact JSON is loaded and its
  // content-id fields are checked for EXACT equality against `id`. A file
  // is returned only if its content actually claims that id in one of the
  // canonical identity slots (STORE_ID_FIELDS ∪ `lineage.artifactId`).
  //
  // Semantics preserved:
  //   - Search order: canonical subdirs before the artifacts root.
  //   - Directories are ignored (only files match).
  //   - Legitimate multi-writer layouts (`tx plan --out` at root PLUS a
  //     canonical copy in `plans/`) still resolve, and subdirs still win
  //     because we return the first exact-content match encountered.
  //
  // Semantics dropped:
  //   - False-positive filename substrings that don't match the artifact's
  //     actual id fields.
  //   - The 64-hex → first-16-hex prefix fallback (subsumed by exact
  //     content verification).
  //
  // Return contract is unchanged (`Promise<string | null>`); callers
  // (`exists`, `readArtifact`, `pathOf`) require no migration.
  private async findArtifactPathById(id: string): Promise<string | null> {
    const searchDirs = [
      ...["plans", "signed", "receipts", "lineage", "misc"].map((sub) =>
        path.join(this.artifactsDir, sub)
      ),
      this.artifactsDir
    ];

    const lowerId = id.toLowerCase();
    // A 64-hex canonical id is often persisted at the filename level as its
    // first-16-hex short form (e.g. `plan-<16-hex>.plan.json`) while the
    // full 64-hex lives in the artifact's `lineage.artifactId` /
    // `contentHash`. The short prefix is retained here purely as a coarse
    // filename filter; content verification is the sole source of truth.
    const lowerPrefix =
      id.length === 64 ? lowerId.slice(0, 16) : null;

    for (const dirPath of searchDirs) {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const lowerName = entry.name.toLowerCase();
        const filenameMatches =
          lowerName.includes(lowerId) ||
          (lowerPrefix !== null && lowerName.includes(lowerPrefix));
        if (!filenameMatches) continue;

        const candidatePath = path.join(dirPath, entry.name);
        if (await this.artifactClaimsId(candidatePath, id)) {
          return candidatePath;
        }
      }
    }
    return null;
  }

  /**
   * Wave 11 · RESOLVER-1 · content-verification helper.
   *
   * Namespaces intentionally SEPARATE from generic artifact identity here:
   *
   *   - `contentHash` — Wave 5 explicitly established that contentHash is
   *     NOT guaranteed to equal artifactId. contentHash-only artifacts
   *     (e.g. snapshots without lineage.artifactId) are path-resolvable
   *     only, not identity-resolvable. Do NOT match on `.contentHash`.
   *
   *   - `txId` — Wave 10 established that Kaspa consensus txId lookup is
   *     receipt-specific and lives in `findReceiptByTxId`. Generic
   *     `readArtifact(txId)` MUST NOT succeed merely because some receipt
   *     carries `.txId === input`; the intentional API separation is that
   *     a caller who wants a receipt by txId asks the receipt-lookup
   *     method, not the generic artifact reader.
   *
   *   - `signedId`, `receiptId` — no existing contract evidence
   *     (searched: tests, docs, callers) supports `readArtifact(signedId)`
   *     or `readArtifact(receiptId)` as an input form. Not added.
   *
   *   - Top-level `.artifactId` — Wave 5's façade explicitly resolves only
   *     `lineage.artifactId`; a distinct top-level `.artifactId` field is
   *     NOT recognised as canonical identity there, so recognising it
   *     here would re-open the namespace-conflation Wave 5 closed.
   *
   * Accepted identity slots (this method's contract):
   *
   *   1. `artifact.lineage.artifactId` — canonical (Wave 5).
   *   2. `artifact.planId`             — legacy short-ID contract, proven
   *      by `store-root-resolution.test.ts` and by the pre-Wave-6 fixture
   *      shape where the parent-plan lookup traverses by planId.
   *
   * Comparison is exact (byte-for-byte, no case-folding, no
   * normalisation). Returns false on any read / parse / non-object /
   * missing-field condition so a corrupt file cannot masquerade as a
   * match. Never throws.
   */
  private async artifactClaimsId(filePath: string, id: string): Promise<boolean> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      return false;
    }
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    let artifact: any;
    try {
      artifact = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!artifact || typeof artifact !== "object") return false;

    if (
      artifact.lineage &&
      typeof artifact.lineage === "object" &&
      artifact.lineage.artifactId === id
    ) {
      return true;
    }
    if (typeof artifact.planId === "string" && artifact.planId === id) {
      return true;
    }
    return false;
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
    const lineage = artifact?.lineage;
    if (lineage && typeof lineage === "object" && "parentArtifactId" in lineage) {
      const canonical = lineage.parentArtifactId;
      if (typeof canonical !== "string" || canonical.length === 0) {
        // Explicit root marker (or non-string). Do NOT fall through.
        return undefined;
      }
      return canonical;
    }
    // Canonical field genuinely absent — legacy fallback allowed.
    if (typeof artifact?.parentArtifactId === "string" && artifact.parentArtifactId.length > 0) {
      return artifact.parentArtifactId;
    }
    if (typeof artifact?.sourceSignedId === "string" && artifact.sourceSignedId.length > 0) {
      return artifact.sourceSignedId;
    }
    if (typeof artifact?.sourcePlanId === "string" && artifact.sourcePlanId.length > 0) {
      return artifact.sourcePlanId;
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
   * present. Uses the same findArtifactPathById lookup as readArtifact but
   * accepts a "we already have the artifact" shortcut when the input was a
   * filesystem path.
   */
  private async pathOf(idOrPath: string): Promise<string> {
    const candidate = path.resolve(process.cwd(), idOrPath);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {}
    const looksLikePath =
      path.isAbsolute(idOrPath) ||
      /[\\/]/.test(idOrPath) ||
      idOrPath === "." ||
      idOrPath === "..";
    if (looksLikePath) return candidate;
    const found = await this.findArtifactPathById(idOrPath);
    return found ?? `unresolved:${idOrPath}`;
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
    const subDirs = ["plans", "signed", "receipts", "lineage", "evidences", "misc"];
    const entries: Array<{
      path: string;
      relativeSubpath: string;
      subDir: string;
      artifact: any;
      id: string;
      schema?: string;
      contentHash?: string;
    }> = [];
    const seenPaths = new Set<string>();

    let resolvedBase: string;
    try {
      resolvedBase = await fs.realpath(this.artifactsDir);
    } catch (e) {
      resolvedBase = path.resolve(this.artifactsDir);
    }

    const scanDirectory = async (dirPath: string, subName: string) => {
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (!file.endsWith(".json")) continue;

          const filePath = path.join(dirPath, file);
          let realPath: string;
          try {
            realPath = await fs.realpath(filePath);
          } catch (e) {
            realPath = path.resolve(filePath);
          }

          const normalizedReal = path.resolve(realPath);

          // Boundary-based containment check (prevents sibling prefix escape like artifacts-evil while allowing files like ..metadata.json)
          const rel = path.relative(resolvedBase, normalizedReal);
          const isContained =
            rel !== "" &&
            rel !== ".." &&
            !rel.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(rel);

          if (!isContained) continue;
          if (seenPaths.has(normalizedReal)) continue;

          try {
            const content = await fs.readFile(normalizedReal, "utf-8");
            const artifact = JSON.parse(content);

            const id = artifact.artifactId || artifact.contentHash || artifact.planId || artifact.signedId || artifact.txId || file.replace(".json", "");
            const relPath = rel.replace(/\\/g, "/");

            seenPaths.add(normalizedReal);

            entries.push({
              path: normalizedReal,
              relativeSubpath: relPath,
              subDir: subName,
              artifact,
              id,
              schema: artifact.schema,
              contentHash: artifact.contentHash
            });
          } catch (e) {}
        }
      } catch (e) {}
    };

    await scanDirectory(this.artifactsDir, "root");
    for (const sub of subDirs) {
      await scanDirectory(path.join(this.artifactsDir, sub), sub);
    }

    entries.sort((a, b) => a.relativeSubpath.localeCompare(b.relativeSubpath));
    return entries;
  }

  async queryArtifacts(query: { schema?: string }): Promise<any[]> {
    const entries = await this.enumerateCanonicalArtifacts();
    if (!query.schema) return entries.map(e => e.artifact);
    return entries.filter(e => e.schema === query.schema).map(e => e.artifact);
  }
}
