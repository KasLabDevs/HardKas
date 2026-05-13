import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { HardkasArtifactBase, HARDKAS_VERSION, ARTIFACT_SCHEMAS } from "@hardkas/artifacts";
import { NetworkId, ExecutionMode } from "@hardkas/core";

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
}

export function getDefaultTracesDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas", "traces");
}

export function getTracePath(txId: string, cwd?: string): string {
  validateTxId(txId);
  return path.join(getDefaultTracesDir(cwd), `${txId}.trace.json`);
}

function validateTxId(txId: string): void {
  if (txId.includes("/") || txId.includes("\\") || txId.includes("..")) {
    throw new Error(`Invalid txId: ${txId}`);
  }
}

export async function saveSimulatedTrace(
  trace: StoredSimulatedTxTrace,
  options?: { cwd?: string }
): Promise<string> {
  const dir = getDefaultTracesDir(options?.cwd);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  const filePath = getTracePath(trace.txId, options?.cwd);
  await fs.writeFile(filePath, JSON.stringify(trace, null, 2), "utf-8");
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

export async function listSimulatedTraces(
  options?: { cwd?: string }
): Promise<StoredSimulatedTxTrace[]> {
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

  return traces.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
