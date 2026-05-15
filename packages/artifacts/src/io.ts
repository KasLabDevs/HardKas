import fs from "node:fs/promises";
import path from "node:path";
import { 
  TxPlan,
  SignedTx,
  TxReceipt
} from "./schemas.js";
import { verifyArtifact } from "./verify.js";

import { writeFileAtomic } from "@hardkas/core";

export const bigIntReplacer = (_key: string, value: any) => 
  typeof value === "bigint" ? value.toString() : value;

export async function writeArtifact(filePath: string, artifact: unknown): Promise<void> {
  const content = typeof artifact === "string" 
    ? artifact 
    : JSON.stringify(artifact, bigIntReplacer, 2) + "\n";
    
  await writeFileAtomic(filePath, content);
}

export function getDefaultReceiptPath(txId: string, cwd: string = process.cwd()): string {
  return path.join(cwd, "artifacts", "receipts", `${txId}.json`);
}

export async function readArtifact(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if ((error as any).code === "ENOENT") {
      throw new Error(`Artifact file not found at ${filePath}`);
    }
    throw new Error(`Failed to read/parse artifact at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
