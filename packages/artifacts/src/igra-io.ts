import fs from "node:fs/promises";
import path from "node:path";
import { 
  IgraTxReceiptArtifact, 
  assertValidIgraTxReceiptArtifact 
} from "./igra-artifacts.js";
import { writeArtifact, readArtifact } from "./io.js";

export function getDefaultL2ReceiptsDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas", "l2-receipts");
}

export function getL2ReceiptPath(txHash: string, options?: { cwd?: string }): string {
  validateTxHash(txHash);
  const dir = getDefaultL2ReceiptsDir(options?.cwd);
  return path.join(dir, `${txHash}.igra.receipt.json`);
}

export async function saveIgraTxReceiptArtifact(
  receipt: IgraTxReceiptArtifact,
  options?: { cwd?: string }
): Promise<string> {
  assertValidIgraTxReceiptArtifact(receipt);
  const filePath = getL2ReceiptPath(receipt.txHash, options);
  await writeArtifact(filePath, receipt);
  return filePath;
}

export async function loadIgraTxReceiptArtifact(
  txHash: string,
  options?: { cwd?: string }
): Promise<IgraTxReceiptArtifact> {
  const filePath = getL2ReceiptPath(txHash, options);
  const data = await readArtifact(filePath);
  assertValidIgraTxReceiptArtifact(data);
  return data;
}

export async function listIgraTxReceiptArtifacts(
  options?: { cwd?: string }
): Promise<readonly IgraTxReceiptArtifact[]> {
  const dir = getDefaultL2ReceiptsDir(options?.cwd);
  
  try {
    const files = await fs.readdir(dir);
    const receiptFiles = files.filter(f => f.endsWith(".igra.receipt.json"));
    
    const receipts: IgraTxReceiptArtifact[] = [];
    for (const file of receiptFiles) {
      try {
        const data = await readArtifact(path.join(dir, file));
        if (data && typeof data === "object" && (data as any).schema === "hardkas.igraTxReceipt.v1") {
          receipts.push(data as IgraTxReceiptArtifact);
        }
      } catch (e) {
        // Skip invalid/unreadable files
      }
    }
    
    return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (e) {
    if ((e as any).code === "ENOENT") return [];
    throw e;
  }
}

function validateTxHash(txHash: string): void {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error(`Invalid EVM txHash: must be a 0x-prefixed 64-character hex string. Got: ${txHash}`);
  }
}
