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
          if (file.includes(id)) {
            return path.join(dirPath, file);
          }
          if (id.length === 64 && file.includes(id.slice(0, 16))) {
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

  async queryArtifacts(query: { schema?: string }): Promise<any[]> {
    const subDirs = ["plans", "signed", "receipts", "lineage", "misc"];
    const results: any[] = [];
    for (const sub of subDirs) {
      const dirPath = path.join(this.artifactsDir, sub);
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const content = await fs.readFile(path.join(dirPath, file), "utf-8");
            const artifact = JSON.parse(content);
            if (query.schema && artifact.schema !== query.schema) continue;
            results.push(artifact);
          } catch (e) {}
        }
      } catch (e) {}
    }
    return results;
  }
}
