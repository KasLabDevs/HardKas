import { HardkasArtifactBase, ARTIFACT_SCHEMAS } from "@hardkas/artifacts";
import { NetworkId, ExecutionMode, HardkasExecutionTarget } from "@hardkas/core";
import { deterministicCompare } from "@hardkas/core";
import { ProjectArtifactStore, resolveArtifact } from "@hardkas/artifacts";

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

export async function saveSimulatedReceipt(
  receipt: StoredSimulatedTxReceipt,
  options?: { cwd?: string }
): Promise<string> {
  const store = new ProjectArtifactStore(options?.cwd || process.cwd());
  const absolutePath = await store.writeArtifact(receipt as any);
  return absolutePath;
}

/**
 * Wave 1.2 · IC-5′: the `tx` namespace. Every receipt carrying `.txId` is verified
 * (declared hash version, claimed identity) before it is returned; identical copies
 * collapse; two distinct receipts for one txId are RECEIPT_AMBIGUOUS_CONFLICT; an
 * invalid candidate fails the lookup (CANDIDATE_INVALID). Never first-match, never
 * the signed artifact.
 */
export async function loadSimulatedReceipt(
  txId: string,
  options?: { cwd?: string }
): Promise<StoredSimulatedTxReceipt> {
  const resolved = await resolveArtifact(options?.cwd || process.cwd(), { tx: txId });
  return resolved.artifact as StoredSimulatedTxReceipt;
}

export async function listSimulatedReceipts(options?: {
  cwd?: string;
}): Promise<StoredSimulatedTxReceipt[]> {
  const store = new ProjectArtifactStore(options?.cwd || process.cwd());
  const artifacts = await store.queryArtifacts({ schema: ARTIFACT_SCHEMAS.TX_RECEIPT });
  return artifacts.sort((a: any, b: any) => deterministicCompare(b.createdAt, a.createdAt)) as any[];
}
