import fs from "node:fs/promises";
import path from "node:path";
import {
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  HARDKAS_VERSION,
  ArtifactStoreMutation,
  checkSyntheticAuthorization,
  resolveArtifactSync,
  storeEntryFor
} from "@hardkas/artifacts";
import { HardkasError, systemRuntimeContext } from "@hardkas/core";
import type { LocalnetState } from "./types.js";
import { applySimulatedPlan } from "./transactions.js";
import { buildStateSnapshotArtifact, calculateStateHash } from "./snapshot.js";
import { buildSimulatedTrace, getTracePath, traceFileFor } from "./traces.js";
import { getDefaultLocalnetStatePath, writeLocalnetLedger } from "./store.js";

/**
 * SIMULATOR-DURABLE-EXECUTION-1: once a simulated ledger transition is durable, enough is durably committed with it to
 * publish or recover its canonical evidence (state snapshot, receipt, trace) exactly, without applying it again. A
 * simulated execution writes its post-state and this record in ONE atomic write of the state file, then publishes the
 * evidence, then writes the state again without the record. Everything else the evidence needs is in the store before
 * the commit (the executed artifact and its plan) or in the state itself.
 */
export const PENDING_EXECUTION_SCHEMA = "hardkas.pendingExecution.v1";

export interface PendingExecutionRecord {
  schema: typeof PENDING_EXECUTION_SCHEMA;
  /** The transition: its outputs in the state are `<txId>:<index>`, created at the state's daaScore. */
  txId: string;
  /** The executed artifact (a signed transaction or a plan); with its plan, in the store before the commit. */
  executedArtifactId: string;
  /** Guards: the state before (by undoing the transition) and after it. */
  preStateHash: string;
  postStateHash: string;
  /** The execution's five clock reads: the only inputs of its evidence that can never be rebuilt. */
  clock: {
    traceStartedAtMs: number;
    submittedAt: string;
    receiptCreatedAt: string;
    traceCompletedAtMs: number;
    snapshotCreatedAt: string;
  };
  /** The workspace root written into the receipt's tracePath and the trace's receiptPath (outside their hashes). */
  workspaceRoot: string;
  /** The evidence format and build: exact bytes need the same ones. */
  format: { hardkasVersion: string; artifactVersion: string; hashVersion: number };
  /** The identities the evidence must have. */
  expected: { receipt: string; stateSnapshot: string; trace: string };
}

export type EvidenceKind = "stateSnapshot" | "receipt" | "trace";

export interface SimulatedExecutionEvidence {
  stateSnapshot: any;
  receipt: any;
  trace: any;
  /** The absolute path the receipt is written to (also recorded, outside the hash, in the trace). */
  receiptPath: string;
  /** What is published, in order: path relative to the store and exact bytes. */
  files: Array<{ kind: EvidenceKind; rel: string; content: string; identity: string }>;
}

export function currentEvidenceFormat(): PendingExecutionRecord["format"] {
  return { hardkasVersion: HARDKAS_VERSION, artifactVersion: ARTIFACT_VERSION, hashVersion: CURRENT_HASH_VERSION };
}

function withoutPending(state: LocalnetState): LocalnetState {
  const { pendingExecution: _record, ...plain } = state;
  return plain;
}

/**
 * Applies a plan to a simulated state exactly as a simulated execution records it: the receipt's lifecycle fields come
 * from the given clock values, its lineage from the executed artifact (a signed transaction, or the plan itself).
 */
export function applySimulatedExecution(input: {
  state: LocalnetState;
  plan: any;
  executed: any;
  txId: string;
  workspaceRoot: string;
  clock: { submittedAt: string; receiptCreatedAt: string };
}): { ok: true; state: LocalnetState; receipt: any } | { ok: false; errors: string[] } {
  const { plan, executed, txId, workspaceRoot, clock } = input;
  const isSigned = executed?.schema === ARTIFACT_SCHEMAS.SIGNED_TX;
  const signedId = isSigned ? executed.signedId || executed.id || "unknown" : "unknown";
  const ctx = { ...systemRuntimeContext, clock: { now: () => Date.parse(clock.receiptCreatedAt) } };
  const sim = applySimulatedPlan(withoutPending(input.state), plan, ctx, {
    txId,
    receiptExtra: {
      submittedAt: clock.submittedAt,
      confirmedAt: clock.submittedAt,
      rpcUrl: "simulated://local",
      tracePath: getTracePath(txId, workspaceRoot),
      ...(isSigned && signedId !== "unknown" ? { sourceSignedId: signedId } : {}),
      ...(isSigned ? { parentArtifact: { contentHash: executed.contentHash, lineage: executed.lineage } } : {})
    }
  });
  if (!sim.ok) return { ok: false, errors: sim.errors ?? [] };
  return { ok: true, state: sim.state, receipt: sim.receipt };
}

/** The canonical evidence of an applied simulated execution, with the exact bytes the store keeps. */
export function buildSimulatedExecutionEvidence(input: {
  postState: LocalnetState;
  receipt: any;
  workspaceRoot: string;
  clock: { traceStartedAtMs: number; traceCompletedAtMs: number; snapshotCreatedAt: string };
}): SimulatedExecutionEvidence {
  const { receipt, workspaceRoot, clock } = input;
  const stateSnapshot = buildStateSnapshotArtifact(withoutPending(input.postState), clock.snapshotCreatedAt);
  const snapshotEntry = storeEntryFor(stateSnapshot);
  const receiptEntry = storeEntryFor(receipt);
  const receiptPath = path.join(workspaceRoot, ".hardkas", "artifacts", receiptEntry.rel);
  const trace: any = buildSimulatedTrace(receipt, { startedAtMs: clock.traceStartedAtMs, completedAtMs: clock.traceCompletedAtMs }, receiptPath);
  const traceEntry = traceFileFor(trace);
  return {
    stateSnapshot,
    receipt,
    trace,
    receiptPath,
    files: [
      { kind: "stateSnapshot", ...snapshotEntry, identity: stateSnapshot.contentHash },
      { kind: "receipt", ...receiptEntry, identity: receipt.contentHash },
      { kind: "trace", ...traceEntry, identity: trace.contentHash }
    ]
  };
}

type Found = "missing" | "exact" | "same-identity-other-bytes" | "other-identity";

async function inspect(workspaceRoot: string, file: SimulatedExecutionEvidence["files"][number]): Promise<Found> {
  let have: string;
  try {
    have = await fs.readFile(path.join(workspaceRoot, ".hardkas", "artifacts", file.rel), "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return "missing";
    throw err;
  }
  if (have === file.content) return "exact";
  try {
    if (JSON.parse(have)?.contentHash === file.identity) return "same-identity-other-bytes";
  } catch {
    // not even an artifact
  }
  return "other-identity";
}

function refusal(code: string, message: string, txId?: string): HardkasError {
  const kept = txId ? ` The pending execution ${txId} is kept; no simulated state change is possible until it is resolved.` : "";
  return new HardkasError(code, `${message}.${kept}`);
}

/**
 * Publishes evidence under the store's lock: a missing file is written atomically through the gate; a file already
 * there with exactly the expected bytes is kept and never rewritten; anything else at an expected path (other bytes,
 * even with the same identity) is RECOVERY_CONFLICT, and then nothing at all is written.
 */
async function publishEvidence(workspaceRoot: string, evidence: SimulatedExecutionEvidence, txId: string): Promise<Record<EvidenceKind, Found>> {
  const gate = new ArtifactStoreMutation(workspaceRoot);
  return gate.hold(async () => {
    const found = {} as Record<EvidenceKind, Found>;
    for (const f of evidence.files) found[f.kind] = await inspect(workspaceRoot, f);
    const conflicts = evidence.files.filter((f) => found[f.kind] !== "missing" && found[f.kind] !== "exact");
    if (conflicts.length > 0) {
      throw refusal(
        "RECOVERY_CONFLICT",
        `The expected evidence of ${txId} is already in the store with other bytes: ${conflicts
          .map((f) => `${f.rel} (${found[f.kind] === "same-identity-other-bytes" ? "same identity, other bytes" : "another identity"})`)
          .join(", ")}`,
        txId
      );
    }
    for (const f of evidence.files) if (found[f.kind] === "missing") await gate.writeFile(f.rel, f.content);
    return found;
  }, "simulated execution evidence");
}

/**
 * Commits a simulated execution, inside the caller's `simulator-state` unit: refuses before the ledger moves when an
 * expected path is already taken by other bytes; writes post-state + record in one atomic write (the commit);
 * publishes the evidence; writes the post-state again without the record (eager clear).
 */
export async function commitSimulatedExecution(
  workspaceRoot: string,
  input: { postState: LocalnetState; record: PendingExecutionRecord; evidence: SimulatedExecutionEvidence }
): Promise<void> {
  const statePath = getDefaultLocalnetStatePath(workspaceRoot);
  const postState = withoutPending(input.postState);
  const { record, evidence } = input;
  await new ArtifactStoreMutation(workspaceRoot).hold(async () => {
    for (const f of evidence.files) {
      const found = await inspect(workspaceRoot, f);
      if (found !== "missing" && found !== "exact") {
        throw new HardkasError("RECOVERY_CONFLICT", `The evidence path ${f.rel} of ${record.txId} is already taken by other bytes; nothing was executed`);
      }
    }
    await writeLocalnetLedger({ ...postState, pendingExecution: record }, statePath);
    await publishEvidence(workspaceRoot, evidence, record.txId);
    await writeLocalnetLedger(postState, statePath);
  }, "simulated execution");
}

/** The state with its last transition (txId, applied at the state's daaScore) undone. */
export function invertSimulatedTransition(state: LocalnetState, txId: string): LocalnetState {
  const D = state.daaScore;
  const utxos = state.utxos
    .filter((u) => !u.id.startsWith(`${txId}:`))
    .map((u) => {
      if (u.spent && u.spentAtDaaScore === D) {
        const { spentAtDaaScore: _undone, ...rest } = u;
        return { ...rest, spent: false };
      }
      return u;
    });
  return { ...withoutPending(state), daaScore: (BigInt(D) - 1n).toString(), utxos };
}

function loadRecoveryMaterial(workspaceRoot: string, record: PendingExecutionRecord): { executed: any; plan: any } {
  const resolve = (id: string, what: string) => {
    try {
      return resolveArtifactSync(workspaceRoot, { artifact: id }).artifact;
    } catch (err: any) {
      throw refusal("RECOVERY_MATERIAL_MISSING", `The ${what} ${id} needed to finish the pending execution cannot be read from the store (${err?.code ?? err?.message ?? err})`, record.txId);
    }
  };
  const executed = resolve(record.executedArtifactId, "executed artifact");
  if (executed?.schema === ARTIFACT_SCHEMAS.SIGNED_TX) {
    const structural = checkSyntheticAuthorization(executed);
    if (!structural.ok) throw refusal("RECOVERY_MATERIAL_MISSING", `The executed artifact ${record.executedArtifactId} is not an executable authorization (${structural.code})`, record.txId);
    const plan = resolve(structural.planArtifactId, "plan");
    const binding = checkSyntheticAuthorization(executed, plan);
    if (!binding.ok || binding.txId !== record.txId) throw refusal("RECOVERY_DIVERGED", `The executed artifact does not authorize ${record.txId}`, record.txId);
    return { executed, plan };
  }
  if (executed?.schema === ARTIFACT_SCHEMAS.TX_PLAN) return { executed, plan: executed };
  throw refusal("RECOVERY_MATERIAL_MISSING", `The executed artifact ${record.executedArtifactId} is neither a signed transaction nor a plan`, record.txId);
}

export type PendingExecutionRecovery =
  | { state: "no-ledger" | "no-pending" }
  | { state: "recovered"; txId: string; published: EvidenceKind[]; alreadyPresent: EvidenceKind[] };

/**
 * SIMULATOR-RECOVERY-FIRST-1, called at the outermost acquisition of `simulator-state`: settles the workspace's pending
 * execution, or throws (fail closed, nothing written) when it cannot prove how to. It never applies the transition to
 * the ledger again: it rebuilds the evidence from the recorded values, the executed artifact and its plan, publishes
 * what is missing, and its only ledger write is the same state without the record. Running it any number of times,
 * interrupted anywhere, converges to the same ledger and the same evidence bytes.
 */
export async function recoverPendingExecution(workspaceRoot: string): Promise<PendingExecutionRecovery> {
  const statePath = getDefaultLocalnetStatePath(workspaceRoot);
  let ledger: any;
  try {
    ledger = JSON.parse(await fs.readFile(statePath, "utf-8"));
  } catch (err: any) {
    if (err?.code === "ENOENT") return { state: "no-ledger" };
    throw err;
  }
  const record = ledger?.pendingExecution as PendingExecutionRecord | undefined;
  if (record === undefined) return { state: "no-pending" };
  if (record === null || typeof record !== "object" || record.schema !== PENDING_EXECUTION_SCHEMA) {
    throw refusal("PENDING_EXECUTION_UNSUPPORTED", `${statePath} records a pending execution in an unknown format (${JSON.stringify((record as any)?.schema)}; this build reads ${PENDING_EXECUTION_SCHEMA})`, (record as any)?.txId);
  }
  const format = currentEvidenceFormat();
  if (record.format?.hashVersion !== format.hashVersion || record.format?.artifactVersion !== format.artifactVersion || record.format?.hardkasVersion !== format.hardkasVersion) {
    throw refusal("RECOVERY_FORMAT_MISMATCH", `The pending execution was recorded with evidence format ${JSON.stringify(record.format)}; this build produces ${JSON.stringify(format)} and cannot reproduce its exact evidence`, record.txId);
  }
  const state = withoutPending(ledger as LocalnetState);
  if (calculateStateHash(state) !== record.postStateHash) {
    throw refusal("PENDING_EXECUTION_STALE", `The simulated state is no longer the one the pending execution committed (something else changed ${statePath})`, record.txId);
  }
  const { executed, plan } = loadRecoveryMaterial(workspaceRoot, record);
  const pre = invertSimulatedTransition(state, record.txId);
  if (calculateStateHash(pre) !== record.preStateHash) {
    throw refusal("RECOVERY_INVERSION_MISMATCH", `Undoing ${record.txId} does not give the state it was applied to`, record.txId);
  }
  const applied = applySimulatedExecution({ state: pre, plan, executed, txId: record.txId, workspaceRoot: record.workspaceRoot, clock: record.clock });
  if (!applied.ok) throw refusal("RECOVERY_DIVERGED", `Recomputing ${record.txId} failed: ${applied.errors.join(", ")}`, record.txId);
  const evidence = buildSimulatedExecutionEvidence({ postState: applied.state, receipt: applied.receipt, workspaceRoot: record.workspaceRoot, clock: record.clock });
  const diverged = [
    calculateStateHash(applied.state) !== record.postStateHash ? "post-state" : null,
    evidence.receipt.contentHash !== record.expected?.receipt ? "receipt" : null,
    evidence.stateSnapshot.contentHash !== record.expected?.stateSnapshot ? "state snapshot" : null,
    evidence.trace.contentHash !== record.expected?.trace ? "trace" : null
  ].filter((d): d is string => d !== null);
  if (diverged.length > 0) throw refusal("RECOVERY_DIVERGED", `The rebuilt evidence of ${record.txId} differs from the recorded identities (${diverged.join(", ")})`, record.txId);
  const found = await publishEvidence(workspaceRoot, evidence, record.txId);
  await writeLocalnetLedger(state, statePath);
  const kinds = Object.keys(found) as EvidenceKind[];
  return { state: "recovered", txId: record.txId, published: kinds.filter((k) => found[k] === "missing"), alreadyPresent: kinds.filter((k) => found[k] === "exact") };
}
