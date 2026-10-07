import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  HardkasArtifactBase,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  calculateContentHash,
  ArtifactStoreMutation
} from "@hardkas/artifacts";
import { NetworkId, ExecutionMode } from "@hardkas/core";

import { deterministicCompare, plainChildPath } from "@hardkas/core";

export type StoredTraceEvent =
  | {
      readonly type: "phase.started";
      readonly phase: string;
      readonly timestamp: number;
    }
  | {
      readonly type: "phase.completed";
      readonly phase: string;
      readonly timestamp: number;
    }
  | {
      readonly type: "note";
      readonly message: string;
      readonly timestamp: number;
    }
  | {
      readonly type: "tx.failed";
      readonly phase: string;
      readonly reason: string;
      readonly timestamp: number;
    };

export interface StoredSimulatedTxTrace extends HardkasArtifactBase {
  readonly schema: typeof ARTIFACT_SCHEMAS.TX_TRACE;
  readonly version: string;
  readonly hashVersion?: number | string;
  readonly txId: string;
  readonly mode: ExecutionMode;
  readonly networkId: NetworkId;
  readonly events: readonly StoredTraceEvent[];
  readonly receiptPath?: string | undefined;
  /**
   * DEF-1a: strict verify requires `lineage`, `workflowId`, and `assumptionLevel`
   * on every persisted lifecycle artifact. Older simulator traces omit these; the
   * fields are optional so historical trace files remain readable per Wave 1
   * backward-compatibility contract, but new trace writes MUST populate them
   * from the parent receipt / plan.
   */
  readonly lineage?: {
    readonly artifactId: string;
    readonly lineageId: string;
    readonly parentArtifactId: string;
    readonly rootArtifactId: string;
    readonly sequence: number;
  };
  readonly workflowId?: string;
  readonly assumptionLevel?: string;
}

export function getDefaultTracesDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas", "artifacts");
}

export function getTracePath(txId: string, cwd?: string): string {
  validateTxId(txId);
  return path.join(getDefaultTracesDir(cwd), `${txId}.trace.json`);
}

function validateTxId(txId: string): void {
  // CONTAINMENT-2: the trace file `<txId>.trace.json` is one plain file of the store root (no separator, ':' or NUL,
  // no Windows device name), checked before it is read or written.
  if (txId.includes("/") || txId.includes("\\") || txId.includes("..") || !plainChildPath(getDefaultTracesDir(), `${txId}.trace.json`)) {
    throw new Error(`Invalid txId: ${txId}`);
  }
}

/**
 * The trace of one simulated execution: a pure function of its canonical receipt, the instants the execution started
 * and completed (both inside the trace's hash) and the receipt's path (outside it). SIMULATOR-DURABLE-EXECUTION-1:
 * recovery rebuilds it byte for byte from the same inputs.
 */
export function buildSimulatedTrace(
  receipt: any,
  timing: { startedAtMs: number; completedAtMs: number },
  receiptPath: string
): StoredSimulatedTxTrace {
  const events: any[] = [
    { type: "phase.started", phase: "send", timestamp: timing.startedAtMs },
    { type: "phase.completed", phase: "send", timestamp: timing.completedAtMs }
  ];
  const steps = events.map((ev) => ({
    phase: ev.phase || (ev.message as string) || "unknown",
    status: ev.type.includes("completed") ? "completed" : ev.type.includes("failed") ? "failed" : "started",
    timestamp: new Date(ev.timestamp).toISOString(),
    details: ev.type === "note" ? { message: ev.message as string } : undefined
  }));
  const traceBase: any = {
    schema: ARTIFACT_SCHEMAS.TX_TRACE,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: receipt.createdAt,
    txId: receipt.txId,
    mode: receipt.mode ?? "simulator",
    networkId: receipt.networkId,
    steps,
    // The raw events are part of the evidence and therefore of the hashed body (under v5 nothing nested is dropped by
    // name); receiptPath is an operational locator and stays outside the hash by contract.
    events,
    ...(receipt.workflowId ? { workflowId: receipt.workflowId } : {}),
    ...(receipt.assumptionLevel ? { assumptionLevel: receipt.assumptionLevel } : {}),
    lineage: {
      artifactId: "",
      lineageId: receipt.lineage?.lineageId || receipt.contentHash || "0".repeat(64),
      parentArtifactId: receipt.contentHash || "0".repeat(64),
      rootArtifactId: receipt.lineage?.rootArtifactId || receipt.contentHash || "0".repeat(64),
      sequence: (receipt.lineage?.sequence || 1) + 1
    }
  };
  // One pass: lineage.artifactId is a self reference excluded by exact path.
  traceBase.contentHash = calculateContentHash(traceBase, CURRENT_HASH_VERSION);
  traceBase.lineage.artifactId = traceBase.contentHash;
  return { ...traceBase, receiptPath };
}

/** Where a trace lives in the store (its root) and the exact bytes written there. */
export function traceFileFor(trace: StoredSimulatedTxTrace): { rel: string; content: string } {
  validateTxId(trace.txId);
  return { rel: `${trace.txId}.trace.json`, content: JSON.stringify(trace, null, 2) };
}

export async function saveSimulatedTrace(
  trace: StoredSimulatedTxTrace,
  options?: { cwd?: string }
): Promise<string> {
  const filePath = getTracePath(trace.txId, options?.cwd);
  // ARTIFACT-MUTATION-1: the trace lives at the store root and is written through the store's gate
  const { rel, content } = traceFileFor(trace);
  await new ArtifactStoreMutation(options?.cwd ?? process.cwd()).writeFile(rel, content);
  return filePath;
}

export async function loadSimulatedTrace(
  txId: string,
  options?: { cwd?: string }
): Promise<StoredSimulatedTxTrace> {
  const filePath = getTracePath(txId, options?.cwd);
  if (!existsSync(filePath)) {
    throw new Error(`Trace not found: ${txId}`);
  }

  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data);
}

export async function listSimulatedTraces(options?: {
  cwd?: string;
}): Promise<StoredSimulatedTxTrace[]> {
  const dir = getDefaultTracesDir(options?.cwd);
  if (!existsSync(dir)) {
    return [];
  }

  const files = await fs.readdir(dir);
  const traces: StoredSimulatedTxTrace[] = [];

  for (const file of files) {
    if (file.endsWith(".trace.json")) {
      try {
        const txId = path.basename(file, ".trace.json");
        const trace = await loadSimulatedTrace(txId, options);
        traces.push(trace);
      } catch (e) {
        // Skip invalid traces
      }
    }
  }

  return traces.sort((a, b) => deterministicCompare(b.createdAt, a.createdAt));
}
