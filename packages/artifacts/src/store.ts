import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { verifyArtifact } from "./verify.js";
import { writeFileAtomic } from "@hardkas/core";
import { assertSafeFileId, codedError as storeError, schemaFilePrefix } from "./file-id.js";
import { LineageError } from "./lineage-error.js";

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

  async findReceiptByTxId(txId: string): Promise<unknown> {
    return this.readArtifact(txId);
  }

  private async findArtifactPathById(id: string): Promise<string | null> {
    // Canonical subdirectories first, then the artifacts root. Not every writer
    // goes through writeArtifact(): `tx plan --out` persists the plan at the
    // root as `<timestamp>-<planId>.plan.json`, and the torture harness writes
    // there too. Without searching the root, a signed transaction can never
    // resolve its parent plan.
    const searchDirs = [
      ...["plans", "signed", "receipts", "lineage", "misc"].map((sub) =>
        path.join(this.artifactsDir, sub)
      ),
      this.artifactsDir
    ];

    const lowerId = id.toLowerCase();

    for (const dirPath of searchDirs) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const lowerFile = entry.name.toLowerCase();
          if (lowerFile.includes(lowerId)) {
            return path.join(dirPath, entry.name);
          }
          if (id.length === 64 && lowerFile.includes(lowerId.slice(0, 16))) {
            return path.join(dirPath, entry.name);
          }
        }
      } catch (e) {
        // Directory doesn't exist, ignore
      }
    }
    return null;
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
