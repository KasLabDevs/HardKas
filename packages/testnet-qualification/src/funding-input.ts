/**
 * TQ-1 funding input contract.
 *
 * Invariants (agreed 2026-09-15):
 *
 * 1. VALIDATE, don't DISCOVER. The declared outpoint comes from the caller
 *    (env / config). This module never searches for "a better UTXO"; if the
 *    declared outpoint is not spendable it fails closed.
 *
 * 2. Local reservation ≠ consensus state. When a caller uses the optional
 *    `LocalReservationLedger`, its semantics are strictly TQ-local: a marker
 *    that THIS run has claimed the outpoint. It never asserts that Kaspa
 *    consensus/mempool has locked/reserved that UTXO.
 *
 * 3. Scoped invariant, NOT a mempool conflict engine. This module checks:
 *      (a) the declared outpoint currently exists at the declared address,
 *      (b) the amount meets `expectedMinimumSompi`,
 *      (c) the scriptPublicKey matches when the caller supplied one,
 *      (d) if coinbase and a maturity context is supplied, it is mature,
 *      (e) not already reserved by THIS run.
 *    It does NOT prove absence of pending conflicts network-wide.
 *
 * 4. No keystore adoption. The `FundingAuthority` describes the expected
 *    address (+ optional scriptPublicKey). Actual private-key loading and
 *    signing stay with the caller/runner, and are wired in a later block via
 *    the existing HardKAS keystore surfaces — never a mini-wallet here.
 */

import type { DaaObserverUtxoRow } from "./daa-observer.js";

export interface DeclaredFundingOutpoint {
  readonly transactionId: string;
  readonly index: number;
}

export interface FundingAuthority {
  readonly address: string;
  /**
   * Optional hex-encoded scriptPublicKey. When present, the observed UTXO's
   * `scriptPublicKey` MUST match exactly (case-insensitive). This is the
   * strongest ownership check available without loading a private key.
   */
  readonly expectedScriptPublicKey?: string;
}

export interface FundingMaturityContext {
  readonly virtualDaaScore: bigint;
  readonly coinbaseMaturityBlocks: bigint;
}

export interface FundingInputSpec {
  readonly authority: FundingAuthority;
  readonly declaredOutpoint: DeclaredFundingOutpoint;
  readonly expectedMinimumSompi: bigint;
  /**
   * Present when the caller wants coinbase maturity to be enforced. Absent
   * when the funding UTXO is known non-coinbase (or the runner decides to
   * skip maturity — in which case `maturityResolvedVia` will be labelled
   * `n/a-no-context`).
   */
  readonly maturityContext?: FundingMaturityContext;
}

export interface FundingInputRpc {
  getUtxosByAddress(address: string): Promise<readonly (DaaObserverUtxoRow & {
    readonly address?: string;
    readonly scriptPublicKey?: string;
    readonly isCoinbase?: boolean;
  })[]>;
}

/**
 * TQ-local reservation ledger. Semantics: this outpoint has been claimed by
 * THIS runner instance. Never a consensus statement.
 */
export interface LocalReservationLedger {
  isReservedForThisRun(outpoint: DeclaredFundingOutpoint): boolean;
  reserveForThisRun(outpoint: DeclaredFundingOutpoint, tag: string): void;
}

export function createInMemoryReservationLedger(): LocalReservationLedger {
  const store = new Map<string, string>();
  const key = (o: DeclaredFundingOutpoint) => `${o.transactionId}:${o.index}`;
  return {
    isReservedForThisRun(o) {
      return store.has(key(o));
    },
    reserveForThisRun(o, tag) {
      store.set(key(o), tag);
    }
  };
}

export interface SourceUtxoEvidence {
  readonly outpoint: DeclaredFundingOutpoint;
  readonly address: string;
  readonly amountSompi: bigint;
  readonly scriptPublicKey?: string;
  readonly isCoinbase: boolean;
  readonly blockDaaScore?: bigint;
  readonly observedVirtualDaaScore?: bigint;
  readonly observedAt: string;
  readonly maturityResolvedVia: "not-coinbase" | "matured" | "n/a-no-context";
  /**
   * TQ-local reservation tag if applied. Always labelled "tq-local" to make
   * the non-consensus semantics visible in the receipt.
   */
  readonly localReservation?: { readonly kind: "tq-local"; readonly tag: string };
}

export type FundingInputFailureReason =
  | "OUTPOINT_NOT_FOUND"
  | "AMOUNT_INSUFFICIENT"
  | "SCRIPT_MISMATCH"
  | "COINBASE_IMMATURE"
  | "ALREADY_LOCAL_RESERVED";

export class FundingInputRejectedError extends Error {
  readonly reason: FundingInputFailureReason;
  readonly detail: Record<string, unknown> | undefined;
  constructor(reason: FundingInputFailureReason, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "FundingInputRejectedError";
    this.reason = reason;
    this.detail = detail;
  }
}

function coerceBigint(v: bigint | string | number | undefined): bigint | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v)) return undefined;
    return BigInt(v);
  }
  if (typeof v === "string") {
    try { return BigInt(v); } catch { return undefined; }
  }
  return undefined;
}

function outpointsEqual(a: DeclaredFundingOutpoint, b: DeclaredFundingOutpoint): boolean {
  return a.transactionId === b.transactionId && a.index === b.index;
}

function normaliseHex(s: string): string {
  return s.startsWith("0x") ? s.slice(2).toLowerCase() : s.toLowerCase();
}

export interface AssertSpendableInput {
  readonly rpc: FundingInputRpc;
  readonly spec: FundingInputSpec;
  readonly localReservation?: LocalReservationLedger;
  readonly runTag?: string;
  readonly now?: () => Date;
}

/**
 * Validate the declared funding outpoint under the scoped invariant. Any
 * failure throws `FundingInputRejectedError` with the specific reason. No
 * discovery, no fallback outpoint search.
 */
export async function assertSpendableOrFailClosed(input: AssertSpendableInput): Promise<SourceUtxoEvidence> {
  const now = input.now ?? (() => new Date());
  const observedAt = now().toISOString();

  // 5(e). Local reservation check first — cheapest gate, avoids RPC calls
  // when we already know this outpoint is claimed by this run.
  if (input.localReservation?.isReservedForThisRun(input.spec.declaredOutpoint)) {
    throw new FundingInputRejectedError(
      "ALREADY_LOCAL_RESERVED",
      `Outpoint ${input.spec.declaredOutpoint.transactionId}:${input.spec.declaredOutpoint.index} is already reserved for THIS run (tq-local marker).`,
      { outpoint: input.spec.declaredOutpoint }
    );
  }

  // 3(a). Existence at the declared address.
  const rows = await input.rpc.getUtxosByAddress(input.spec.authority.address);
  const row = rows.find((r) => outpointsEqual(r.outpoint, input.spec.declaredOutpoint));
  if (!row) {
    throw new FundingInputRejectedError(
      "OUTPOINT_NOT_FOUND",
      `Declared outpoint ${input.spec.declaredOutpoint.transactionId}:${input.spec.declaredOutpoint.index} not found at ${input.spec.authority.address}`,
      { outpoint: input.spec.declaredOutpoint, address: input.spec.authority.address }
    );
  }

  const amountSompi = coerceBigint(row.amountSompi);
  if (amountSompi === undefined) {
    throw new FundingInputRejectedError(
      "OUTPOINT_NOT_FOUND",
      `Outpoint present but amountSompi is unusable (${String(row.amountSompi)}); treating as absent.`,
      { outpoint: input.spec.declaredOutpoint, observed: row.amountSompi }
    );
  }

  // 3(c). ScriptPublicKey match — strongest ownership evidence without a key.
  const observedSpk = row.scriptPublicKey;
  if (input.spec.authority.expectedScriptPublicKey !== undefined) {
    if (observedSpk === undefined || normaliseHex(observedSpk) !== normaliseHex(input.spec.authority.expectedScriptPublicKey)) {
      throw new FundingInputRejectedError(
        "SCRIPT_MISMATCH",
        `Observed scriptPublicKey does not match expected on outpoint ${input.spec.declaredOutpoint.transactionId}:${input.spec.declaredOutpoint.index}.`,
        {
          expected: input.spec.authority.expectedScriptPublicKey,
          observed: observedSpk ?? null
        }
      );
    }
  }

  // 3(b). Amount sufficiency.
  if (amountSompi < input.spec.expectedMinimumSompi) {
    throw new FundingInputRejectedError(
      "AMOUNT_INSUFFICIENT",
      `Outpoint amount ${amountSompi.toString()} is below expectedMinimumSompi ${input.spec.expectedMinimumSompi.toString()}.`,
      { observedAmountSompi: amountSompi.toString(), expectedMinimumSompi: input.spec.expectedMinimumSompi.toString() }
    );
  }

  // 3(d). Coinbase maturity — only enforced when caller provided a context.
  const isCoinbase = row.isCoinbase === true;
  const blockDaaScore = coerceBigint(row.blockDaaScore);
  let maturityResolvedVia: SourceUtxoEvidence["maturityResolvedVia"];
  if (!isCoinbase) {
    maturityResolvedVia = "not-coinbase";
  } else if (input.spec.maturityContext) {
    const { virtualDaaScore, coinbaseMaturityBlocks } = input.spec.maturityContext;
    if (blockDaaScore === undefined) {
      throw new FundingInputRejectedError(
        "COINBASE_IMMATURE",
        `Outpoint is coinbase but observed blockDaaScore is missing; cannot verify maturity.`,
        { outpoint: input.spec.declaredOutpoint }
      );
    }
    const delta = virtualDaaScore - blockDaaScore;
    if (delta < coinbaseMaturityBlocks) {
      throw new FundingInputRejectedError(
        "COINBASE_IMMATURE",
        `Coinbase outpoint not yet mature: virtualDaaScore(${virtualDaaScore.toString()}) - blockDaaScore(${blockDaaScore.toString()}) = ${delta.toString()} < coinbaseMaturityBlocks(${coinbaseMaturityBlocks.toString()}).`,
        {
          virtualDaaScore: virtualDaaScore.toString(),
          blockDaaScore: blockDaaScore.toString(),
          delta: delta.toString(),
          required: coinbaseMaturityBlocks.toString()
        }
      );
    }
    maturityResolvedVia = "matured";
  } else {
    maturityResolvedVia = "n/a-no-context";
  }

  // All checks passed. Reserve locally if a ledger was provided.
  if (input.localReservation) {
    const tag = input.runTag ?? "tq-run";
    input.localReservation.reserveForThisRun(input.spec.declaredOutpoint, tag);
  }

  const evidence: SourceUtxoEvidence = {
    outpoint: input.spec.declaredOutpoint,
    address: input.spec.authority.address,
    amountSompi,
    ...(observedSpk !== undefined ? { scriptPublicKey: observedSpk } : {}),
    isCoinbase,
    ...(blockDaaScore !== undefined ? { blockDaaScore } : {}),
    ...(input.spec.maturityContext ? { observedVirtualDaaScore: input.spec.maturityContext.virtualDaaScore } : {}),
    observedAt,
    maturityResolvedVia,
    ...(input.localReservation
      ? { localReservation: { kind: "tq-local" as const, tag: input.runTag ?? "tq-run" } }
      : {})
  };
  return evidence;
}
