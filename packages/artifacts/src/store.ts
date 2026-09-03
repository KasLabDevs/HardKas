import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { verifyArtifact } from "./verify.js";
import { writeFileAtomic } from "@hardkas/core";

const bigIntReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export class ProjectArtifactStore {
  private artifactsDir: string;

  constructor(workspaceRoot: string) {
    this.artifactsDir = path.join(workspaceRoot, ".hardkas", "artifacts");
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (e) {}
  }

  async writeArtifact(artifact: any): Promise<string> {
    const id = artifact.artifactId || artifact.contentHash || artifact.planId || artifact.signedId || artifact.txId || Date.now().toString(36);
    const prefix = artifact.schema ? artifact.schema.split(".")[1] || "artifact" : "artifact";
    let subDir = "misc";
    if (artifact.schema) {
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

    const content = JSON.stringify(artifact, bigIntReplacer, 2) + "\n";
    await writeFileAtomic(targetPath, content);
    
    return targetPath;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.findArtifactPathById(id)) !== null;
  }

  async readArtifact(id: string): Promise<unknown> {
    // If it's an absolute or relative path that actually exists, just read it directly
    // This allows fallback for people passing paths (e.g. `tx receipt ./my-receipt.json`)
    try {
      const stats = await fs.stat(id);
      if (stats.isFile()) {
         const resolvedPath = path.resolve(process.cwd(), id);
         const workspaceRoot = path.resolve(this.artifactsDir, "../..");
         if (!resolvedPath.startsWith(workspaceRoot)) {
           const err = new Error(`Artifact with ID ${id} is outside the workspace boundary`);
           (err as any).code = "PATH_TRAVERSAL";
           throw err;
         }
         let content = await fs.readFile(id, "utf-8");
         if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
         return JSON.parse(content);
      }
    } catch (e: any) {
      if (e.code === "PATH_TRAVERSAL") throw e;
      // Not a valid path, continue to ID resolution
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
    const subdirs = ["plans", "signed", "receipts", "lineage", "misc"];
    for (const sub of subdirs) {
      const dirPath = path.join(this.artifactsDir, sub);
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          const lowerFile = file.toLowerCase();
          const lowerId = id.toLowerCase();
          if (lowerFile.includes(lowerId)) {
            return path.join(dirPath, file);
          }
          if (id.length === 64 && lowerFile.includes(lowerId.slice(0, 16))) {
            return path.join(dirPath, file);
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
