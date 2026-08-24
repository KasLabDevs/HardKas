import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  HardkasArtifactBase,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS
} from "@hardkas/artifacts";
import { NetworkId, ExecutionMode, HardkasExecutionTarget, writeFileAtomic } from "@hardkas/core";
import { deterministicCompare } from "@hardkas/core";

export interface StoredSimulatedTxReceipt extends HardkasArtifactBase {
  schema: typeof ARTIFACT_SCHEMAS.TX_RECEIPT;
  version: "1.0.0-alpha";
  hashVersion?: number | string;
  txId: string;
  status: "confirmed" | "failed";
  mode: ExecutionMode;
  networkId: NetworkId;
  execution: HardkasExecutionTarget;
  from: { address: string };
  to: { address: string };
  amountSompi: string;
  feeSompi: string;
  changeSompi?: string | undefined;
  spentUtxoIds: string[];
  createdUtxoIds: string[];
  daaScore: string;
}

import { ProjectArtifactStore } from "@hardkas/artifacts";

export async function saveSimulatedReceipt(
  receipt: StoredSimulatedTxReceipt,
  options?: { cwd?: string }
): Promise<string> {
  const store = new ProjectArtifactStore(options?.cwd || process.cwd());
  const absolutePath = await store.writeArtifact(receipt as any);
  return absolutePath;
}

export async function loadSimulatedReceipt(
  txId: string,
  options?: { cwd?: string }
): Promise<StoredSimulatedTxReceipt> {
  const store = new ProjectArtifactStore(options?.cwd || process.cwd());
  // The simulator might have written it with txId as artifactId, or we can find it by txId.
  // Let's first try direct read in case artifactId === txId (or receipt-txId).
  try {
    const direct = await store.readArtifact(txId);
    if (direct && (direct as any).txId === txId) {
      return direct as any;
    }
  } catch(e) {}

  const artifacts = await store.queryArtifacts({ schema: ARTIFACT_SCHEMAS.TX_RECEIPT });
  const found = artifacts.find((a: any) => a.txId === txId);
  if (!found) {
    throw new Error(`Receipt not found: ${txId}`);
  }
  return found as any;
}

export async function listSimulatedReceipts(options?: {
  cwd?: string;
}): Promise<StoredSimulatedTxReceipt[]> {
  const store = new ProjectArtifactStore(options?.cwd || process.cwd());
  const artifacts = await store.queryArtifacts({ schema: ARTIFACT_SCHEMAS.TX_RECEIPT });
  return artifacts.sort((a: any, b: any) => deterministicCompare(b.createdAt, a.createdAt)) as any[];
}
