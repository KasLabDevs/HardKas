import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { verifyArtifact } from "./verify.js";

import { writeFileAtomic } from "@hardkas/core";

import { ProjectArtifactStore } from "./store.js";

export const bigIntReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export async function writeArtifact(filePath: string, artifact: unknown): Promise<void> {
  let isDir = false;
  try {
    const stat = await fs.stat(filePath);
    isDir = stat.isDirectory();
  } catch (err) {
    if (filePath.endsWith("/") || filePath.endsWith("\\")) {
      isDir = true;
    }
  }

  let finalPath = filePath;
  if (isDir) {
    const anyArt = artifact as any;
    const schema = anyArt.schema || "unknown";
    const id = anyArt.id || anyArt.planId || Date.now().toString();
    const basename = `${schema.split('.').pop()}-${id}.json`;
    finalPath = path.join(filePath, basename);
  }

  await writeFileAtomic(finalPath, JSON.stringify(artifact, bigIntReplacer, 2));
}

export function getDefaultReceiptPath(txId: string, cwd: string = process.cwd()): string {
  // Deprecated. We just return a mock path for backwards compatibility until refactored out.
  return path.join(cwd, ".hardkas", "artifacts", "receipts", `${txId}.json`);
}

export async function readArtifact(filePath: string): Promise<unknown> {
  try {
    let content = await fs.readFile(filePath, "utf-8");
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Artifact file not found at ${filePath}`);
    }
    throw new Error(
      `Failed to read/parse artifact at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function readTxPlanArtifact(filePath: string): Promise<TxPlan> {
  const result = await verifyArtifact(filePath);
  if (!result.ok) {
    throw new Error(`Invalid TxPlan artifact: ${result.errors.join(", ")}`);
  }
  const data = await readArtifact(filePath);
  return data as TxPlan;
}

export async function readSignedTxArtifact(filePath: string): Promise<SignedTx> {
  const result = await verifyArtifact(filePath);
  if (!result.ok) {
    throw new Error(`Invalid SignedTx artifact: ${result.errors.join(", ")}`);
  }
  const data = await readArtifact(filePath);
  return data as SignedTx;
}

export async function readTxReceiptArtifact(filePath: string): Promise<TxReceipt> {
  const result = await verifyArtifact(filePath);
  if (!result.ok) {
    throw new Error(`Invalid TxReceipt artifact: ${result.errors.join(", ")}`);
  }
  const data = await readArtifact(filePath);
  return data as TxReceipt;
}
