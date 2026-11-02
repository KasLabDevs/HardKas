// SAFETY_LEVEL: SIMULATION_ONLY
//
// @hardkas/testing — R-01: what one CONSENSUS_SIMNET submission establishes, stage by stage, and nothing more.
//
// A transaction handed to a node passes five stages; each is reached only on its own evidence:
//   BUILT          built and signed by the caller; its official kaspa-wasm id equals the expected txid;
//   SENT           the submission request left this process (it was not refused before the transport);
//   RPC_ACCEPTED   the node's answer names the expected txid and carries no rejection (an answer naming no transaction,
//                  or another one, accepts nothing);
//   NODE_ACCEPTED  the node holds it: its mempool lists it, or its effect is in the node's UTXO index;
//   DAG_CONFIRMED  its effect is in the node's UTXO index (the virtual UTXO set): every output listed under txid:index
//                  with its amount and covenant id, every spent input gone. Included in an accepted block as observed at
//                  that moment; not finality.
// Outcomes: CONFIRMED (DAG_CONFIRMED reached); ACCEPTED_UNCONFIRMED (RPC_ACCEPTED, no inclusion observed in the window);
// REJECTED (the node's own rejection); NOT_SENT (the request never reached the node: refused before the transport, or
// the transport could not deliver it); TIMEOUT (sent, no answer in time: the node may hold it); UNKNOWN (any other
// ambiguous result: no usable answer, another txid, "already held", a connection lost after sending, an unclassified
// failure). Only CONFIRMED is a consensus pass; the classification never turns an ambiguous result into one.

import {
  RpcConnectionError,
  RpcSubmitOutcomeUnknownError,
  RpcTimeoutError,
  RpcUnavailableError,
  isNodeNetworkIdentityError,
  isRpcRequestNotSentError,
  officialTxIdOf
} from "@hardkas/kaspa-rpc";
import { submitOutcomeOf } from "@hardkas/artifacts";

export type ConsensusSubmissionStage = "BUILT" | "SENT" | "RPC_ACCEPTED" | "NODE_ACCEPTED" | "DAG_CONFIRMED";

export type ConsensusSubmissionOutcome =
  | "CONFIRMED"
  | "ACCEPTED_UNCONFIRMED"
  | "REJECTED"
  | "NOT_SENT"
  | "TIMEOUT"
  | "UNKNOWN";

/** The node calls a CONSENSUS_SIMNET submission uses: a JsonWrpcKaspaClient, or an adapter of one, satisfies it. */
export interface ConsensusSimnetRpc {
  readonly submitTransaction: (
    tx: any,
    options?: { readonly allowOrphan?: boolean; readonly expectedTxId?: string }
  ) => Promise<unknown>;
  readonly getUtxosByAddress: (address: string) => Promise<readonly any[]>;
  readonly mineBlocks?: ((count: number, address?: string) => Promise<unknown>) | undefined;
  readonly getMempoolEntry?: ((txId: string) => Promise<unknown>) | undefined;
}

export interface ConsensusObservationOptions {
  /** UTXO-index observations after the submission (default 60). */
  readonly attempts?: number | undefined;
  /** Delay between observations in ms (default 250). */
  readonly intervalMs?: number | undefined;
}

export interface ConsensusExpectedOutput {
  readonly address: string;
  readonly index: number;
  readonly amountSompi: bigint;
  readonly covenantId?: string | undefined;
}

export interface ConsensusSpentInput {
  readonly address: string;
  readonly outpoint: { readonly transactionId: string; readonly index: number };
}

export interface ConsensusSubmissionEvidence {
  readonly expectedTxId: string;
  readonly stagesReached: readonly ConsensusSubmissionStage[];
  readonly outcome: ConsensusSubmissionOutcome;
  /** Why the outcome is what it is, starting with a stable code (e.g. `TXID_MISMATCH: …`). */
  readonly detail: string;
  /** The node's answer to the submission, as received (bigints as strings). */
  readonly rpcAnswer?: unknown;
  /** The failure text of the submission, when it failed. */
  readonly submitError?: string | undefined;
  readonly observation?: {
    readonly attempts: number;
    readonly mempoolListed: boolean;
    readonly outputsFound: number;
    readonly outputsExpected: number;
    readonly inputsStillUnspent: number;
    readonly mismatches: readonly string[];
    readonly errors: readonly string[];
  } | undefined;
}

const HEX64 = /^[0-9a-f]{64}$/;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function plain(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {
    return String(value);
  }
}

/** A submission that failed: what the failure establishes (never a pass). */
function classifyFailure(e: unknown): { outcome: ConsensusSubmissionOutcome; sent: boolean; detail: string } {
  const msg = messageOf(e);
  if (isRpcRequestNotSentError(e)) return { outcome: "NOT_SENT", sent: false, detail: `NOT_SENT: refused before the transport (${msg})` };
  if (isNodeNetworkIdentityError(e)) return { outcome: "NOT_SENT", sent: false, detail: `NOT_SENT: node network identity refused (${msg})` };
  if (e instanceof RpcTimeoutError || (e instanceof RpcSubmitOutcomeUnknownError && e.cause instanceof RpcTimeoutError)) {
    return { outcome: "TIMEOUT", sent: true, detail: `SUBMIT_TIMEOUT: no answer in time; the node may hold the transaction (${msg})` };
  }
  if (e instanceof RpcSubmitOutcomeUnknownError) return { outcome: "UNKNOWN", sent: true, detail: `SUBMIT_OUTCOME_UNKNOWN: ${msg}` };
  if (e instanceof RpcConnectionError || e instanceof RpcUnavailableError) {
    return { outcome: "UNKNOWN", sent: true, detail: `TRANSPORT_LOST_AFTER_SEND: the request may have reached the node (${msg})` };
  }
  // the node's own answer, thrown: rusty-kaspa's "Rejected transaction <id>: <reason>" (or "already held": unknown)
  const byText = submitOutcomeOf({ accepted: false, error: msg });
  if (byText === "rejected") return { outcome: "REJECTED", sent: true, detail: `NODE_REJECTED: ${msg}` };
  return { outcome: "UNKNOWN", sent: true, detail: `SUBMIT_FAILED_UNCLASSIFIED: ${msg}` };
}

/** A submission that resolved: whether its answer accepts the expected transaction. */
function classifyAnswer(
  answer: unknown,
  expectedTxId: string
): { accepted: true } | { accepted: false; outcome: ConsensusSubmissionOutcome; detail: string } {
  const a = answer as Record<string, unknown> | string | null | undefined;
  if (a === null || a === undefined) return { accepted: false, outcome: "UNKNOWN", detail: "NO_ANSWER: the submission resolved without an answer" };
  const error = typeof a === "object" ? a.error : undefined;
  const errorText = typeof error === "string" ? error : error && typeof error === "object" ? String((error as any).message ?? JSON.stringify(error)) : undefined;
  const acceptedField = typeof a === "object" ? a.accepted : undefined;
  if (acceptedField === false || (errorText !== undefined && errorText.length > 0)) {
    const byText = submitOutcomeOf({ accepted: false, ...(errorText ? { error: errorText } : {}) });
    return byText === "rejected"
      ? { accepted: false, outcome: "REJECTED", detail: `NODE_REJECTED: ${errorText ?? "the answer says accepted: false"}` }
      : { accepted: false, outcome: "UNKNOWN", detail: `ANSWER_NOT_ACCEPTED: ${errorText ?? "accepted is not true"}` };
  }
  if (acceptedField !== undefined && acceptedField !== true) {
    return { accepted: false, outcome: "UNKNOWN", detail: `ANSWER_NOT_ACCEPTED: accepted is ${JSON.stringify(plain(acceptedField))}` };
  }
  const named = typeof a === "string" ? a : a.transactionId ?? a.transactionID ?? a.transaction_id ?? a.txId;
  if (typeof named !== "string" || named.trim() === "") {
    return { accepted: false, outcome: "UNKNOWN", detail: "NO_TXID_IN_ANSWER: the answer names no transaction" };
  }
  if (named.trim().toLowerCase() !== expectedTxId) {
    return { accepted: false, outcome: "UNKNOWN", detail: `TXID_MISMATCH: the answer names ${named}, not the submitted ${expectedTxId}` };
  }
  return { accepted: true };
}

function covenantIdOf(u: any): string | undefined {
  const e = u?.raw?.utxoEntry ?? u?.raw?.utxo_entry ?? {};
  const id = u?.covenantId ?? u?.covenant_id ?? e.covenantId ?? e.covenant_id;
  return id === undefined || id === null || id === "" ? undefined : String(id).toLowerCase();
}

function outpointOf(u: any): { transactionId: string; index: number } | undefined {
  const o = u?.outpoint;
  const id = o?.transactionId ?? o?.transaction_id;
  if (typeof id !== "string") return undefined;
  return { transactionId: id.toLowerCase(), index: Number(o.index) };
}

function amountOf(u: any): bigint | undefined {
  try {
    return BigInt(u?.amountSompi ?? u?.amount);
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Submits `rpcTransaction` (whose official id must be `expectedTxId`) to `rpc` and observes what the node did with it.
 * Never throws for a node, transport or observation failure: the outcome says what was and was not established.
 */
export async function submitAndObserveConsensus(
  rpc: ConsensusSimnetRpc,
  params: {
    readonly rpcTransaction: unknown;
    readonly expectedTxId: string;
    /** Every output of the transaction, as the node's UTXO index lists it once the transaction is accepted. */
    readonly outputs: readonly ConsensusExpectedOutput[];
    /** Every input the transaction spends. */
    readonly spentInputs: readonly ConsensusSpentInput[];
    readonly observation?: ConsensusObservationOptions | undefined;
  }
): Promise<ConsensusSubmissionEvidence> {
  const expectedTxId = String(params.expectedTxId).toLowerCase();
  const stages: ConsensusSubmissionStage[] = [];
  const done = (outcome: ConsensusSubmissionOutcome, detail: string, extra: Partial<ConsensusSubmissionEvidence> = {}): ConsensusSubmissionEvidence => ({
    expectedTxId,
    stagesReached: [...stages],
    outcome,
    detail,
    ...extra
  });

  // BUILT: the transaction about to be sent is the expected one (kaspa-wasm's id, as the clients compute it)
  if (!HEX64.test(expectedTxId)) return done("NOT_SENT", `EXPECTED_TXID_INVALID: ${params.expectedTxId} is not a 64-hex transaction id; nothing was sent`);
  let officialId: string;
  try {
    officialId = officialTxIdOf(params.rpcTransaction);
  } catch (e) {
    return done("NOT_SENT", `EXPECTED_TXID_UNVERIFIABLE: the official id of the transaction cannot be computed (${messageOf(e)}); nothing was sent`);
  }
  if (officialId !== expectedTxId) {
    return done("NOT_SENT", `EXPECTED_TXID_MISMATCH: the transaction's official id is ${officialId}, not the expected ${expectedTxId}; nothing was sent`);
  }
  stages.push("BUILT");

  // SENT / RPC_ACCEPTED
  let answer: unknown;
  try {
    answer = await rpc.submitTransaction(params.rpcTransaction, { allowOrphan: false, expectedTxId });
  } catch (e) {
    const c = classifyFailure(e);
    if (c.sent) stages.push("SENT");
    return done(c.outcome, c.detail, { submitError: messageOf(e) });
  }
  stages.push("SENT");
  const rpcAnswer = plain(answer);
  const verdict = classifyAnswer(answer, expectedTxId);
  if (!verdict.accepted) return done(verdict.outcome, verdict.detail, { rpcAnswer });
  stages.push("RPC_ACCEPTED");

  // NODE_ACCEPTED (mempool), before any block takes it out of the mempool
  let mempoolListed = false;
  const errors: string[] = [];
  if (rpc.getMempoolEntry) {
    try {
      const entry = await rpc.getMempoolEntry(expectedTxId);
      mempoolListed = entry !== null && entry !== undefined;
    } catch (e) {
      errors.push(`getMempoolEntry: ${messageOf(e)}`);
    }
  }
  if (mempoolListed) stages.push("NODE_ACCEPTED");

  if (rpc.mineBlocks) {
    try {
      await rpc.mineBlocks(1);
    } catch (e) {
      errors.push(`mineBlocks: ${messageOf(e)}`);
    }
  }

  // DAG_CONFIRMED: the transaction's effect in the node's UTXO index
  const attempts = Math.max(1, Math.floor(params.observation?.attempts ?? 60));
  const intervalMs = Math.max(0, Math.floor(params.observation?.intervalMs ?? 250));
  const outputsExpected = params.outputs.length;
  let outputsFound = 0;
  let inputsStillUnspent = params.spentInputs.length;
  let mismatches: string[] = [];
  let made = 0;
  const addresses = [...new Set([...params.outputs.map((o) => o.address), ...params.spentInputs.map((i) => i.address)])];
  for (let n = 0; n < attempts; n++) {
    if (n > 0 && intervalMs > 0) await sleep(intervalMs);
    made = n + 1;
    const listed = new Map<string, readonly any[]>();
    try {
      for (const address of addresses) listed.set(address, await rpc.getUtxosByAddress(address));
    } catch (e) {
      errors.push(`getUtxosByAddress (observation ${made}): ${messageOf(e)}`);
      continue;
    }
    mismatches = [];
    outputsFound = 0;
    for (const o of params.outputs) {
      const entry = (listed.get(o.address) ?? []).find((u) => {
        const op = outpointOf(u);
        return op !== undefined && op.transactionId === expectedTxId && op.index === o.index;
      });
      if (!entry) continue;
      const amount = amountOf(entry);
      const covenantId = covenantIdOf(entry);
      if (amount !== o.amountSompi) {
        mismatches.push(`output ${o.index}: amount ${String(amount)} listed, ${o.amountSompi} expected`);
      } else if ((o.covenantId?.toLowerCase() ?? undefined) !== covenantId) {
        mismatches.push(`output ${o.index}: covenant id ${covenantId ?? "(none)"} listed, ${o.covenantId ?? "(none)"} expected`);
      } else {
        outputsFound++;
      }
    }
    inputsStillUnspent = params.spentInputs.filter((i) =>
      (listed.get(i.address) ?? []).some((u) => {
        const op = outpointOf(u);
        return op !== undefined && op.transactionId === i.outpoint.transactionId.toLowerCase() && op.index === i.outpoint.index;
      })
    ).length;
    if (outputsExpected > 0 && outputsFound === outputsExpected && inputsStillUnspent === 0) break;
  }
  const observation = { attempts: made, mempoolListed, outputsFound, outputsExpected, inputsStillUnspent, mismatches, errors };

  if (outputsExpected === 0) {
    return done("ACCEPTED_UNCONFIRMED", "NO_OBSERVABLE_OUTPUT: the transaction creates no output to observe in the UTXO index", { rpcAnswer, observation });
  }
  if (outputsFound === outputsExpected && inputsStillUnspent === 0) {
    if (!stages.includes("NODE_ACCEPTED")) stages.push("NODE_ACCEPTED");
    stages.push("DAG_CONFIRMED");
    return done("CONFIRMED", `INCLUDED: ${outputsFound}/${outputsExpected} outputs listed under ${expectedTxId}, ${params.spentInputs.length} inputs spent (observation ${made})`, { rpcAnswer, observation });
  }
  const why =
    mismatches.length > 0
      ? `OUTPUT_MISMATCH: ${mismatches.join("; ")}`
      : `NOT_OBSERVED: ${outputsFound}/${outputsExpected} outputs listed, ${inputsStillUnspent} input(s) still unspent after ${made} observation(s)`;
  return done("ACCEPTED_UNCONFIRMED", why, { rpcAnswer, observation });
}
