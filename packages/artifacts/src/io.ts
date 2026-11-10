import fs from "node:fs/promises";
import path from "node:path";
import { TxPlan, SignedTx, TxReceipt } from "./schemas.js";
import { verifyArtifact } from "./verify.js";

import { writeFileAtomic } from "@hardkas/core";

import { ProjectArtifactStore } from "./store.js";
import { ArtifactStoreMutation } from "./store-mutation.js";
import { assertSafeFileId, schemaFilePrefix } from "./file-id.js";

export const bigIntReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

/**
 * Writes an artifact as JSON (atomically; through the store's gate when the target is inside an artifact store).
 * Returns the absolute path written (a directory target gets a file named after the artifact), so the caller can
 * announce the write (`emitArtifactWritten`, EVENT-LEDGER-2 D4). This function itself announces nothing.
 */
export async function writeArtifact(filePath: string, artifact: unknown): Promise<string> {
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
    const id = anyArt.id
      ? assertSafeFileId("id", typeof anyArt.id === "number" ? String(anyArt.id) : anyArt.id)
      : anyArt.planId
        ? assertSafeFileId("planId", anyArt.planId)
        : Date.now().toString();
    const basename = `${schemaFilePrefix(anyArt.schema, -1, "unknown")}-${id}.json`;
    finalPath = path.join(filePath, basename);
  }

  const data = JSON.stringify(artifact, bigIntReplacer, 2);
  // ARTIFACT-MUTATION-1: a target inside an artifact store is written through the store's gate
  const inStore = ArtifactStoreMutation.forPath(finalPath);
  if (inStore && inStore.relPath) {
    await inStore.store.writeFile(inStore.relPath, data);
    return path.resolve(finalPath);
  }
  await writeFileAtomic(finalPath, data);
  return path.resolve(finalPath);
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

/**
 * INT9 · the error a typed reader throws for an artifact that does not verify: the same message as before, plus the
 * `code` of the first error issue (e.g. ARTIFACT_HASH_MISMATCH), so a caller (the CLI's error renderer) reports the
 * cause `artifact verify` reports instead of UNKNOWN_ERROR.
 */
function invalidArtifactError(kind: string, result: Awaited<ReturnType<typeof verifyArtifact>>): Error {
  const err = new Error(`Invalid ${kind} artifact: ${result.errors.join(", ")}`) as Error & { code: string };
  err.code = result.issues.find((i) => i.severity === "error")?.code ?? "ARTIFACT_INVALID";
  return err;
}

export async function readTxPlanArtifact(filePath: string): Promise<TxPlan> {
  const result = await verifyArtifact(filePath);
  if (!result.ok) {
    throw invalidArtifactError("TxPlan", result);
  }
  const data = await readArtifact(filePath);
  return data as TxPlan;
}

export async function readSignedTxArtifact(filePath: string): Promise<SignedTx> {
  const result = await verifyArtifact(filePath);
  if (!result.ok) {
    throw invalidArtifactError("SignedTx", result);
  }
  const data = await readArtifact(filePath);
  return data as SignedTx;
}

export async function readTxReceiptArtifact(filePath: string): Promise<TxReceipt> {
  const result = await verifyArtifact(filePath);
  if (!result.ok) {
    throw invalidArtifactError("TxReceipt", result);
  }
  const data = await readArtifact(filePath);
  return data as TxReceipt;
}
