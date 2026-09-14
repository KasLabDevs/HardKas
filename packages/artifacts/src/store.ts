import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { verifyArtifact } from "./verify.js";
import { writeFileAtomic } from "@hardkas/core";
import { assertSafeFileId, codedError as storeError, schemaFilePrefix } from "./file-id.js";

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

  async resolveLineage(id: string): Promise<any[]> {
    const artifact = await this.readArtifact(id);
    const lineage = [artifact];
    let current = artifact as any;

    const getParentId = (c: any) => c.lineage?.parentArtifactId || c.parentArtifactId || c.planId || c.sourceSignedId || c.sourcePlanId;
    let parentId = getParentId(current);
    while (parentId) {
      if (parentId === current.planId && current.schema?.includes("TxPlan")) {
        break; // planId on a plan refers to itself
      }
      if (parentId === current.signedId || parentId === current.txId) {
         break; // circular reference fallback
      }
      try {
        current = await this.readArtifact(parentId);
        lineage.unshift(current);
        parentId = getParentId(current);
      } catch (e) {
        // Break if parent not found
        break;
      }
    }
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
