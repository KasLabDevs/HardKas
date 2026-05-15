import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { HardkasArtifactBase, HARDKAS_VERSION, ARTIFACT_SCHEMAS } from "@hardkas/artifacts";
import { NetworkId, ExecutionMode, writeFileAtomic } from "@hardkas/core";

export interface StoredSimulatedTxReceipt extends HardkasArtifactBase {
  schema: typeof ARTIFACT_SCHEMAS.TX_RECEIPT;
  version: "1.0.0-alpha";
  hashVersion?: number | string;
  txId: string;
  status: "confirmed" | "failed";
  mode: ExecutionMode;
  networkId: NetworkId;
  from: { address: string };
  to: { address: string };
  amountSompi: string;
  feeSompi: string;
  changeSompi?: string | undefined;
  spentUtxoIds: string[];
  createdUtxoIds: string[];
  daaScore: string;
}

export function getDefaultReceiptsDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas", "receipts");
}

export function getReceiptPath(txId: string, cwd?: string): string {
  validateTxId(txId);
  return path.join(getDefaultReceiptsDir(cwd), `${txId}.json`);
}

function validateTxId(txId: string): void {
  if (txId.includes("/") || txId.includes("\\") || txId.includes("..")) {
    throw new Error(`Invalid txId: ${txId}`);
  }
}

export async function saveSimulatedReceipt(
  receipt: StoredSimulatedTxReceipt,
  options?: { cwd?: string }
): Promise<string> {
  const dir = getDefaultReceiptsDir(options?.cwd);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  const filePath = getReceiptPath(receipt.txId, options?.cwd);
  await writeFileAtomic(filePath, JSON.stringify(receipt, null, 2), { encoding: "utf-8" });
  return filePath;
}

export async function loadSimulatedReceipt(
  txId: string,
  options?: { cwd?: string }
): Promise<StoredSimulatedTxReceipt> {
  const filePath = getReceiptPath(txId, options?.cwd);
  if (!existsSync(filePath)) {
    throw new Error(`Receipt not found: ${txId}`);
  }

  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data);
}

export async function listSimulatedReceipts(
  options?: { cwd?: string }
): Promise<StoredSimulatedTxReceipt[]> {
  const dir = getDefaultReceiptsDir(options?.cwd);
  if (!existsSync(dir)) {
    return [];
  }

  const files = await fs.readdir(dir);
  const receipts: StoredSimulatedTxReceipt[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const txId = path.basename(file, ".json");
        const receipt = await loadSimulatedReceipt(txId, options);
        receipts.push(receipt);
      } catch (e) {
        // Skip invalid receipts
      }
    }
  }

  return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
