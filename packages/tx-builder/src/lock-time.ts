import { HardkasError } from "@hardkas/core";

/*
 * Absolute time locks (CLTV) · the lock time of a transaction HardKAS plans, signs and sends.
 *
 * Kaspa (rusty-kaspa v2.1.0, consensus/core/src/constants.rs, tx_validation_in_header_context.rs check_transaction_finality):
 *  - `lockTime` is a u64. Below LOCK_TIME_THRESHOLD (500 000 000 000) it is a DAA score, at or above it a time in
 *    milliseconds compared with the past median time. 0 means no lock;
 *  - a transaction is final when its lock time is 0, or strictly below the reference (the virtual DAA score, or the past
 *    median time, of the context it is validated in), or when every input's sequence is the maximum (u64::MAX): the lock
 *    time is then ignored. A transaction that is not final is refused (the node never holds it to accept later);
 *  - OpCheckLockTimeVerify compares the spending transaction's lock time with a value of the same kind and fails for an
 *    input whose sequence is the maximum.
 * HardKAS gives every input sequence 0 (TX-SEQUENCE-1), never the maximum, so a lock time it signs is enforced. A plan
 * states its lock time as a typed value, never a bare number: `{ daaScore }` or `{ timestampMs }` (decimal strings in the
 * artifact). Absent means 0 and is never written, so a plan without a lock time is exactly what it was before.
 */

/** rusty-kaspa `LOCK_TIME_THRESHOLD`: below it a lock time is a DAA score, at or above it milliseconds since the epoch. */
export const LOCK_TIME_THRESHOLD = 500_000_000_000n;
/** rusty-kaspa `MAX_TX_IN_SEQUENCE_NUM`: an input at this sequence is final (a lock time is ignored when all are). */
export const MAX_TX_IN_SEQUENCE_NUM = 0xffff_ffff_ffff_ffffn;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

/** What a caller asks for: a DAA score or a time in milliseconds (bigint, a safe integer or a decimal string). */
export type LockTimeRequest = { readonly daaScore: bigint | number | string } | { readonly timestampMs: bigint | number | string };

/** A lock time as a plan records it (decimal strings). */
export type PlanLockTime = { readonly daaScore: string } | { readonly timestampMs: string };

/** What a plan records next to its lock time: where the node was when the plan was made (visible distance). */
export interface PlanLockTimeObserved {
  readonly virtualDaaScore?: string;
  readonly pastMedianTimeMs?: string;
}

export type LockTimeKind = "daaScore" | "timestampMs";

function lockTimeError(code: string, message: string, metadata?: Record<string, unknown>): HardkasError {
  return new HardkasError(code, message, metadata ? { metadata } : undefined);
}

const invalid = (where: string, why: string) =>
  lockTimeError(
    "LOCK_TIME_INVALID",
    `${where} ${why}. A lock time is a typed value: { daaScore } (a DAA score below ${LOCK_TIME_THRESHOLD}) or { timestampMs } ` +
      `(milliseconds since the epoch, at or above ${LOCK_TIME_THRESHOLD}). Nothing was planned or signed.`
  );

function u64Of(v: unknown, where: string): bigint {
  let n: bigint | undefined;
  if (typeof v === "bigint") n = v;
  else if (typeof v === "number" && Number.isSafeInteger(v)) n = BigInt(v);
  else if (typeof v === "string" && /^\d{1,20}$/.test(v)) n = BigInt(v);
  if (n === undefined || n < 0n || n > U64_MAX) throw invalid(where, `${JSON.stringify(typeof v === "bigint" ? v.toString() : v)} is not a u64 integer`);
  return n;
}

const isZero = (v: unknown) => v === 0 || v === 0n || v === "0";

/**
 * The lock time a caller asks for, checked: `undefined` for none (absent, null, or a bare 0, which always meant "no lock"),
 * else `{ daaScore }` (1 ≤ value < LOCK_TIME_THRESHOLD) or `{ timestampMs }` (LOCK_TIME_THRESHOLD ≤ value ≤ u64::MAX).
 * A bare non-zero number, a DAA score at or above the threshold (a time read as a score), a time below it (a score read as
 * a time), a value of 0 inside a typed one, or any other shape: LOCK_TIME_INVALID.
 */
export function parseLockTimeRequest(value: unknown, where = "lockTime"): PlanLockTime | undefined {
  if (value === undefined || value === null || isZero(value)) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw invalid(where, `is the bare value ${JSON.stringify(typeof value === "bigint" ? value.toString() : value)}: say which kind it is`);
  }
  const keys = Object.keys(value as object).filter((k) => (value as any)[k] !== undefined);
  const known = keys.filter((k) => k === "daaScore" || k === "timestampMs");
  if (known.length !== 1 || keys.length !== 1) throw invalid(where, `states ${JSON.stringify(keys)}: exactly one of daaScore or timestampMs`);
  const kind = known[0] as LockTimeKind;
  const n = u64Of((value as any)[kind], `${where}.${kind}`);
  if (n === 0n) throw invalid(where, `is ${kind} 0, which is no lock: leave the lock time out`);
  if (kind === "daaScore" && n >= LOCK_TIME_THRESHOLD) {
    throw invalid(where, `is the DAA score ${n}, at or above ${LOCK_TIME_THRESHOLD}: Kaspa would read it as a time in milliseconds`);
  }
  if (kind === "timestampMs" && n < LOCK_TIME_THRESHOLD) {
    throw invalid(where, `is the time ${n} ms, below ${LOCK_TIME_THRESHOLD}: Kaspa would read it as a DAA score`);
  }
  return kind === "daaScore" ? { daaScore: n.toString() } : { timestampMs: n.toString() };
}

/** The kind of a u64 lock time by Kaspa's threshold (0 is none). */
export function lockTimeKindOfValue(value: bigint): LockTimeKind | undefined {
  if (value === 0n) return undefined;
  return value < LOCK_TIME_THRESHOLD ? "daaScore" : "timestampMs";
}

/** The u64 a typed lock time is (its kind already checked by parseLockTimeRequest / planLockTimeValue). */
export function lockTimeValueOf(lockTime: PlanLockTime): bigint {
  return BigInt("daaScore" in lockTime ? lockTime.daaScore : lockTime.timestampMs);
}

/** "DAA score 1234" / "time 1767225600000 ms (2026-01-01T00:00:00.000Z)" / "0 (no lock)". */
export function describeLockTime(value: bigint): string {
  const kind = lockTimeKindOfValue(value);
  if (kind === undefined) return "0 (no lock)";
  if (kind === "daaScore") return `DAA score ${value}`;
  let iso = "";
  try {
    iso = ` (${new Date(Number(value)).toISOString()})`;
  } catch {
    iso = "";
  }
  return `time ${value} ms${iso}`;
}

/**
 * The lock time a plan authorizes, as the u64 its transaction carries: 0 when the plan states none (absent, null, or a
 * bare 0, as every plan before CLTV); the value of its typed `lockTime` ({ daaScore } | { timestampMs }, decimal strings,
 * with an optional `observedAt`) checked against the threshold. Anything else — a bare non-zero number, a wrong kind, an
 * unknown field — is LOCK_TIME_INVALID: a signer or a send never guesses which lock a plan meant.
 */
export function planLockTimeValue(plan: unknown): bigint {
  const stated = (plan as { lockTime?: unknown } | null | undefined)?.lockTime;
  if (stated === undefined || stated === null || isZero(stated)) return 0n;
  if (typeof stated !== "object" || Array.isArray(stated)) {
    throw invalid("the plan's lockTime", `is the bare value ${JSON.stringify(typeof stated === "bigint" ? stated.toString() : stated)}`);
  }
  const { observedAt, ...typed } = stated as Record<string, unknown>;
  if (observedAt !== undefined && (typeof observedAt !== "object" || observedAt === null || Array.isArray(observedAt))) {
    throw invalid("the plan's lockTime", "has an observedAt that is not an object");
  }
  const parsed = parseLockTimeRequest(typed, "the plan's lockTime");
  if (parsed === undefined) throw invalid("the plan's lockTime", "states no value");
  return lockTimeValueOf(parsed);
}

/** The typed lock time a plan states, or undefined (see planLockTimeValue). */
export function planLockTimeOf(plan: unknown): PlanLockTime | undefined {
  const value = planLockTimeValue(plan);
  const kind = lockTimeKindOfValue(value);
  return kind === undefined ? undefined : kind === "daaScore" ? { daaScore: value.toString() } : { timestampMs: value.toString() };
}

/**
 * A signer's check of a lock time against the inputs it signs: an input at the maximum sequence is final, so with it the
 * lock time is not enforced (every input at the maximum: ignored by consensus) and OpCheckLockTimeVerify fails for it.
 * HardKAS never builds one; a plan stating one with a lock time is refused (LOCK_TIME_VOID_SEQUENCE).
 */
export function assertLockTimeEnforceable(lockTime: bigint, sequences: ReadonlyArray<bigint | undefined>, what = "the plan"): void {
  if (lockTime === 0n) return;
  const at = sequences.findIndex((s) => s !== undefined && BigInt.asUintN(64, s) === MAX_TX_IN_SEQUENCE_NUM);
  if (at >= 0) {
    throw lockTimeError(
      "LOCK_TIME_VOID_SEQUENCE",
      `${what} states lock time ${describeLockTime(lockTime)} and input ${at} has the maximum sequence (${MAX_TX_IN_SEQUENCE_NUM}): ` +
        "a finalized input makes the lock void (consensus ignores the lock time when every input is at the maximum, and " +
        "OpCheckLockTimeVerify fails for such an input). Nothing was signed.",
      { input: at }
    );
  }
}

/** Where the node is, for a lock-time check: its virtual DAA score and its past median time (ms), as far as it said. */
export interface LockTimeChainPoint {
  readonly virtualDaaScore?: bigint | undefined;
  readonly pastMedianTimeMs?: bigint | undefined;
}

export type LockTimeFinality =
  | { readonly final: true; readonly reason: "no-lock" | "reached" | "all-inputs-final"; readonly lockTime: bigint; readonly reference?: bigint }
  | { readonly final: false; readonly kind: LockTimeKind; readonly lockTime: bigint; readonly reference: bigint }
  | { readonly final: "unknown"; readonly kind: LockTimeKind; readonly lockTime: bigint; readonly missing: "virtualDaaScore" | "pastMedianTimeMs" };

/**
 * rusty-kaspa `check_transaction_finality` at a chain point: final when the lock time is 0, strictly below the reference
 * (the virtual DAA score for a DAA-score lock, the past median time for a time lock), or when every input's sequence is
 * the maximum. `unknown` when the reference was not given and the inputs do not make it final.
 */
export function lockTimeFinality(input: { readonly lockTime: bigint; readonly sequences: ReadonlyArray<bigint>; readonly point: LockTimeChainPoint }): LockTimeFinality {
  const { lockTime } = input;
  const kind = lockTimeKindOfValue(lockTime);
  if (kind === undefined) return { final: true, reason: "no-lock", lockTime };
  const reference = kind === "daaScore" ? input.point.virtualDaaScore : input.point.pastMedianTimeMs;
  if (reference !== undefined && lockTime < reference) return { final: true, reason: "reached", lockTime, reference };
  if (input.sequences.length > 0 && input.sequences.every((s) => BigInt.asUintN(64, s) === MAX_TX_IN_SEQUENCE_NUM)) {
    return { final: true, reason: "all-inputs-final", lockTime, ...(reference !== undefined ? { reference } : {}) };
  }
  if (reference === undefined) return { final: "unknown", kind, lockTime, missing: kind === "daaScore" ? "virtualDaaScore" : "pastMedianTimeMs" };
  return { final: false, kind, lockTime, reference };
}

/**
 * The send preflight of a lock time, read-only, before a broadcast: LOCK_TIME_NOT_REACHED when the node's virtual DAA score
 * (or past median time) has not passed it, LOCK_TIME_UNVERIFIABLE when the node did not say. Sent now, the node would refuse
 * the transaction (it is not final) and that refusal would be the transaction's one recorded submission; the identical
 * transaction, valid once the lock is reached, has the same txId and could never be sent again. Refused here, nothing is
 * sent or recorded, and it can be sent once the lock is reached.
 */
export function assertLockTimeReached(input: { readonly lockTime: bigint; readonly sequences: ReadonlyArray<bigint>; readonly point: LockTimeChainPoint; readonly what?: string }): LockTimeFinality {
  const verdict = lockTimeFinality(input);
  const what = input.what ?? "the transaction";
  if (verdict.final === "unknown") {
    throw lockTimeError(
      "LOCK_TIME_UNVERIFIABLE",
      `${what} has lock time ${describeLockTime(verdict.lockTime)} and the node did not report its ${verdict.missing === "virtualDaaScore" ? "virtual DAA score" : "past median time"}, ` +
        "so whether the lock is reached cannot be checked. Sent now, a node refusal would be the transaction's one submission (one submission per txId). Nothing was sent or recorded.",
      { lockTime: verdict.lockTime.toString(), kind: verdict.kind }
    );
  }
  if (verdict.final === false) {
    const remaining = verdict.lockTime - verdict.reference + 1n;
    const unit = verdict.kind === "daaScore" ? "DAA" : "ms";
    throw lockTimeError(
      "LOCK_TIME_NOT_REACHED",
      `${what} has lock time ${describeLockTime(verdict.lockTime)}; the node is at ${verdict.kind === "daaScore" ? `virtual DAA score ${verdict.reference}` : `past median time ${verdict.reference} ms`}, ` +
        `so it is not final yet (it is final once the ${verdict.kind === "daaScore" ? "virtual DAA score" : "past median time"} is above the lock time: ${remaining} ${unit} more). ` +
        "Sent now the node would refuse it, and the identical transaction could not be sent again later (one submission per txId). Nothing was sent or recorded; send it again then.",
      { lockTime: verdict.lockTime.toString(), kind: verdict.kind, reference: verdict.reference.toString(), remaining: remaining.toString() }
    );
  }
  return verdict;
}

/** A typed lock time with what the node said when the plan was made (the plan's `lockTime` field). */
export function planLockTimeRecord(lockTime: PlanLockTime, observed: LockTimeChainPoint): PlanLockTime & { readonly observedAt?: PlanLockTimeObserved } {
  const observedAt: PlanLockTimeObserved = {
    ...(observed.virtualDaaScore !== undefined ? { virtualDaaScore: observed.virtualDaaScore.toString() } : {}),
    ...(observed.pastMedianTimeMs !== undefined ? { pastMedianTimeMs: observed.pastMedianTimeMs.toString() } : {})
  };
  return { ...lockTime, ...(Object.keys(observedAt).length > 0 ? { observedAt } : {}) };
}

/** How far a lock time is from a chain point, in its own unit (0 when reached; undefined when the point is unknown). */
export function lockTimeDistance(lockTime: bigint, point: LockTimeChainPoint): bigint | undefined {
  const kind = lockTimeKindOfValue(lockTime);
  if (kind === undefined) return 0n;
  const reference = kind === "daaScore" ? point.virtualDaaScore : point.pastMedianTimeMs;
  if (reference === undefined) return undefined;
  return lockTime < reference ? 0n : lockTime - reference + 1n;
}

/** The node's chain point from a getBlockDagInfo answer (raw, or wrapped), as far as it says. */
export function lockTimeChainPointOf(dagInfo: unknown): LockTimeChainPoint {
  const d: any = (dagInfo as any)?.getBlockDagInfoResponse ?? dagInfo;
  const big = (v: unknown): bigint | undefined => {
    try {
      return v === undefined || v === null || v === "" ? undefined : BigInt(v as any);
    } catch {
      return undefined;
    }
  };
  const virtualDaaScore = big(d?.virtualDaaScore ?? d?.virtual_daa_score);
  const pastMedianTimeMs = big(d?.pastMedianTime ?? d?.past_median_time ?? d?.pastMedianTimeMs);
  return { ...(virtualDaaScore !== undefined ? { virtualDaaScore } : {}), ...(pastMedianTimeMs !== undefined ? { pastMedianTimeMs } : {}) };
}

/**
 * Where a node is now, for a lock-time check: its getBlockDagInfo answer read through the generic `call` every HardKAS RPC
 * client exposes (the typed getBlockDagInfo of some clients drops the past median time), else through getBlockDagInfo.
 * Read-only. A failed read gives an empty point (the check then says LOCK_TIME_UNVERIFIABLE), never an invented one.
 */
export async function readLockTimeChainPoint(rpc: { call?: (method: string, params?: any) => Promise<unknown>; getBlockDagInfo?: () => Promise<unknown> } | undefined): Promise<LockTimeChainPoint> {
  let point: LockTimeChainPoint = {};
  if (typeof rpc?.call === "function") {
    try {
      point = lockTimeChainPointOf(await rpc.call("getBlockDagInfo", {}));
    } catch {
      point = {};
    }
  }
  if ((point.virtualDaaScore === undefined || point.pastMedianTimeMs === undefined) && typeof rpc?.getBlockDagInfo === "function") {
    try {
      const typed = lockTimeChainPointOf(await rpc.getBlockDagInfo());
      point = { ...typed, ...point };
    } catch {
      /* what the first read gave */
    }
  }
  return point;
}

/**
 * The lock-time preflight of a signed payload against a node's getBlockDagInfo answer (read by the caller right before
 * its broadcast): returns the verdict when the transaction is final there, throws LOCK_TIME_NOT_REACHED /
 * LOCK_TIME_UNVERIFIABLE otherwise (assertLockTimeReached). A payload whose lock time cannot be read is LOCK_TIME_INVALID.
 */
export function assertPayloadLockTimeReached(rawTransaction: unknown, dagInfo: unknown, what?: string): LockTimeFinality {
  const read = lockTimeOfPayload(rawTransaction);
  if (!read) throw invalid(what ?? "the signed transaction", "carries no readable lock time and input sequences");
  return assertLockTimeReached({ lockTime: read.lockTime, sequences: read.sequences, point: lockTimeChainPointOf(dagInfo), ...(what ? { what } : {}) });
}

/** The lock time and input sequences a signed payload (JSON transaction, as HardKAS sends it) carries. */
export function lockTimeOfPayload(rawTransaction: unknown): { lockTime: bigint; sequences: bigint[] } | undefined {
  let tx: any = rawTransaction;
  for (let depth = 0; typeof tx === "string" && depth < 3; depth++) {
    try {
      tx = JSON.parse(tx);
    } catch {
      return undefined;
    }
  }
  tx = tx?.outputs ? tx : tx?.tx?.inner ?? tx?.inner ?? tx?.transaction ?? tx;
  if (!tx || !Array.isArray(tx.inputs)) return undefined;
  try {
    const lockTime = BigInt(tx.lockTime ?? tx.lock_time ?? 0);
    const sequences = (tx.inputs as any[]).map((i) => BigInt(i?.sequence ?? 0));
    return { lockTime, sequences };
  } catch {
    return undefined;
  }
}
