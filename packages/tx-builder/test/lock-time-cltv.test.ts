import { describe, it, expect } from "vitest";
import {
  LOCK_TIME_THRESHOLD,
  MAX_TX_IN_SEQUENCE_NUM,
  assertLockTimeEnforceable,
  assertLockTimeReached,
  assertPayloadLockTimeReached,
  assertV1PlanShape,
  describeLockTime,
  lockTimeChainPointOf,
  lockTimeDistance,
  lockTimeFinality,
  lockTimeOfPayload,
  parseLockTimeRequest,
  planLockTimeOf,
  planLockTimeRecord,
  planLockTimeValue,
  readLockTimeChainPoint
} from "../src/index.js";

// -----------------------------------------------------------------------------
// CLTV · the typed lock time HardKAS plans, signs and sends (lock-time.ts). Kaspa's rule (rusty-kaspa v2.1.0
// check_transaction_finality): below LOCK_TIME_THRESHOLD a DAA score, at or above it a time in ms; final when 0, strictly
// below the reference, or every input at the maximum sequence. Pure: no node, no key.
// -----------------------------------------------------------------------------

const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
    return undefined;
  } catch (e: any) {
    return e?.code;
  }
};

describe("CLTV · parseLockTimeRequest: typed, never a bare number, the kind checked against the threshold", () => {
  it("none: absent, null, a bare 0 (what every plan before CLTV meant)", () => {
    for (const v of [undefined, null, 0, 0n, "0"]) expect(parseLockTimeRequest(v), String(v)).toBeUndefined();
  });

  it("a DAA score below the threshold and a time at or above it", () => {
    expect(parseLockTimeRequest({ daaScore: 1n })).toEqual({ daaScore: "1" });
    expect(parseLockTimeRequest({ daaScore: "123456" })).toEqual({ daaScore: "123456" });
    expect(parseLockTimeRequest({ daaScore: LOCK_TIME_THRESHOLD - 1n })).toEqual({ daaScore: "499999999999" });
    expect(parseLockTimeRequest({ timestampMs: LOCK_TIME_THRESHOLD })).toEqual({ timestampMs: "500000000000" });
    expect(parseLockTimeRequest({ timestampMs: 1_767_225_600_000 })).toEqual({ timestampMs: "1767225600000" });
    expect(parseLockTimeRequest({ timestampMs: (1n << 64n) - 1n })).toEqual({ timestampMs: "18446744073709551615" });
  });

  it("LOCK_TIME_INVALID: a bare value, the wrong kind for its value, 0 inside a typed one, two kinds, an unknown field, not a u64", () => {
    const bad: unknown[] = [
      5,
      5n,
      "5",
      "1700000000000",
      { daaScore: LOCK_TIME_THRESHOLD },
      { timestampMs: LOCK_TIME_THRESHOLD - 1n },
      { daaScore: 0n },
      { timestampMs: "0" },
      { daaScore: 1n, timestampMs: LOCK_TIME_THRESHOLD },
      { daaScore: 1n, extra: 1 },
      { blocks: 5 },
      {},
      [],
      { daaScore: -1n },
      { daaScore: 1.5 },
      { daaScore: "0x10" },
      { timestampMs: 1n << 64n },
      { daaScore: Number.MAX_SAFE_INTEGER + 2 }
    ];
    for (const v of bad) expect(codeOf(() => parseLockTimeRequest(v)), JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x))).toBe("LOCK_TIME_INVALID");
  });
});

describe("CLTV · planLockTimeValue: what a plan authorizes (absent = 0, so every existing plan is unchanged)", () => {
  it("absent / null / a bare 0 are lock time 0", () => {
    for (const p of [{}, { lockTime: undefined }, { lockTime: null }, { lockTime: 0 }, { lockTime: "0" }, null, undefined]) expect(planLockTimeValue(p)).toBe(0n);
  });

  it("the typed value, with or without what the node said when the plan was made", () => {
    expect(planLockTimeValue({ lockTime: { daaScore: "7000" } })).toBe(7000n);
    expect(planLockTimeValue({ lockTime: { timestampMs: "1767225600000", observedAt: { pastMedianTimeMs: "1767000000000" } } })).toBe(1_767_225_600_000n);
    expect(planLockTimeOf({ lockTime: { daaScore: "7000", observedAt: { virtualDaaScore: "6000" } } })).toEqual({ daaScore: "7000" });
    expect(planLockTimeOf({})).toBeUndefined();
  });

  it("LOCK_TIME_INVALID for a bare non-zero value (RC1 · D7 called it LOCK_TIME_NOT_SUPPORTED), a wrong kind, a bad observedAt", () => {
    for (const lockTime of [5, "5", "1700000000000", { daaScore: "600000000000" }, { daaScore: "5", observedAt: "x" }, { timestampMs: "5" }]) {
      expect(codeOf(() => planLockTimeValue({ lockTime })), JSON.stringify(lockTime)).toBe("LOCK_TIME_INVALID");
    }
  });

  it("planLockTimeRecord keeps the typed value and adds only what the node said", () => {
    expect(planLockTimeRecord({ daaScore: "9" }, {})).toEqual({ daaScore: "9" });
    expect(planLockTimeRecord({ daaScore: "9" }, { virtualDaaScore: 5n, pastMedianTimeMs: 1n })).toEqual({ daaScore: "9", observedAt: { virtualDaaScore: "5", pastMedianTimeMs: "1" } });
  });
});

describe("CLTV · finality: rusty-kaspa check_transaction_finality", () => {
  const point = { virtualDaaScore: 1000n, pastMedianTimeMs: 1_767_225_600_000n };

  it("a DAA-score lock is final only strictly below the virtual DAA score (equal is not final)", () => {
    expect(lockTimeFinality({ lockTime: 999n, sequences: [0n], point })).toMatchObject({ final: true, reason: "reached" });
    expect(lockTimeFinality({ lockTime: 1000n, sequences: [0n], point })).toMatchObject({ final: false, kind: "daaScore", reference: 1000n });
    expect(lockTimeFinality({ lockTime: 1001n, sequences: [0n], point })).toMatchObject({ final: false });
  });

  it("a time lock against the past median time; 0 is no lock; every input at the maximum sequence ignores the lock", () => {
    expect(lockTimeFinality({ lockTime: point.pastMedianTimeMs - 1n, sequences: [0n], point })).toMatchObject({ final: true });
    expect(lockTimeFinality({ lockTime: point.pastMedianTimeMs, sequences: [0n], point })).toMatchObject({ final: false, kind: "timestampMs" });
    expect(lockTimeFinality({ lockTime: 0n, sequences: [0n], point })).toMatchObject({ final: true, reason: "no-lock" });
    expect(lockTimeFinality({ lockTime: 5000n, sequences: [MAX_TX_IN_SEQUENCE_NUM, MAX_TX_IN_SEQUENCE_NUM], point })).toMatchObject({ final: true, reason: "all-inputs-final" });
    expect(lockTimeFinality({ lockTime: 5000n, sequences: [MAX_TX_IN_SEQUENCE_NUM, 0n], point })).toMatchObject({ final: false });
  });

  it("assertLockTimeReached: LOCK_TIME_NOT_REACHED with how far, LOCK_TIME_UNVERIFIABLE when the node did not say", () => {
    let err: any;
    try {
      assertLockTimeReached({ lockTime: 1005n, sequences: [0n], point });
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe("LOCK_TIME_NOT_REACHED");
    expect(err?.metadata).toMatchObject({ lockTime: "1005", kind: "daaScore", reference: "1000", remaining: "6" });
    expect(String(err?.message)).toMatch(/Nothing was sent or recorded/);
    expect(codeOf(() => assertLockTimeReached({ lockTime: 1005n, sequences: [0n], point: {} }))).toBe("LOCK_TIME_UNVERIFIABLE");
    expect(codeOf(() => assertLockTimeReached({ lockTime: LOCK_TIME_THRESHOLD + 1n, sequences: [0n], point: { virtualDaaScore: 1n } }))).toBe("LOCK_TIME_UNVERIFIABLE");
    expect(assertLockTimeReached({ lockTime: 999n, sequences: [0n], point })).toMatchObject({ final: true });
  });

  it("lockTimeDistance in the lock's own unit", () => {
    expect(lockTimeDistance(1500n, point)).toBe(501n);
    expect(lockTimeDistance(10n, point)).toBe(0n);
    expect(lockTimeDistance(1500n, {})).toBeUndefined();
    expect(lockTimeDistance(0n, {})).toBe(0n);
  });

  it("assertLockTimeEnforceable: a lock with an input at the maximum sequence is void (LOCK_TIME_VOID_SEQUENCE); without a lock anything goes", () => {
    expect(codeOf(() => assertLockTimeEnforceable(5n, [0n, MAX_TX_IN_SEQUENCE_NUM]))).toBe("LOCK_TIME_VOID_SEQUENCE");
    expect(codeOf(() => assertLockTimeEnforceable(5n, [0n, 7n, undefined]))).toBeUndefined();
    expect(codeOf(() => assertLockTimeEnforceable(0n, [MAX_TX_IN_SEQUENCE_NUM]))).toBeUndefined();
  });

  it("describeLockTime names the kind", () => {
    expect(describeLockTime(0n)).toMatch(/no lock/);
    expect(describeLockTime(12n)).toBe("DAA score 12");
    expect(describeLockTime(1_767_225_600_000n)).toMatch(/^time 1767225600000 ms \(2026-01-01T00:00:00.000Z\)$/);
  });
});

describe("CLTV · the node's chain point and the payload's lock time", () => {
  it("lockTimeChainPointOf reads getBlockDagInfo raw or wrapped; readLockTimeChainPoint prefers the raw call (it keeps the past median time)", async () => {
    expect(lockTimeChainPointOf({ virtualDaaScore: "12", pastMedianTime: "34" })).toEqual({ virtualDaaScore: 12n, pastMedianTimeMs: 34n });
    expect(lockTimeChainPointOf({ getBlockDagInfoResponse: { virtualDaaScore: 5 } })).toEqual({ virtualDaaScore: 5n });
    expect(lockTimeChainPointOf(undefined)).toEqual({});
    const rpc = { call: async () => ({ virtualDaaScore: 7n, pastMedianTime: 9n }), getBlockDagInfo: async () => ({ virtualDaaScore: 0n }) };
    expect(await readLockTimeChainPoint(rpc)).toEqual({ virtualDaaScore: 7n, pastMedianTimeMs: 9n });
    const typedOnly = { call: async () => { throw new Error("no"); }, getBlockDagInfo: async () => ({ virtualDaaScore: 3n }) };
    expect(await readLockTimeChainPoint(typedOnly)).toEqual({ virtualDaaScore: 3n });
    expect(await readLockTimeChainPoint(undefined)).toEqual({});
  });

  it("lockTimeOfPayload / assertPayloadLockTimeReached read the JSON a signer writes", () => {
    const payload = JSON.stringify({ version: 0, inputs: [{ previousOutpoint: { transactionId: "a".repeat(64), index: 0 }, sequence: "0" }], outputs: [], lockTime: "1500" });
    expect(lockTimeOfPayload(payload)).toEqual({ lockTime: 1500n, sequences: [0n] });
    expect(lockTimeOfPayload(JSON.stringify(payload))).toEqual({ lockTime: 1500n, sequences: [0n] });
    expect(codeOf(() => assertPayloadLockTimeReached(payload, { virtualDaaScore: "1500" }))).toBe("LOCK_TIME_NOT_REACHED");
    expect(assertPayloadLockTimeReached(payload, { virtualDaaScore: "1501" })).toMatchObject({ final: true, reason: "reached" });
    expect(codeOf(() => assertPayloadLockTimeReached("not json", {}))).toBe("LOCK_TIME_INVALID");
  });
});

describe("CLTV · a v1 plan's lock time (assertV1PlanShape)", () => {
  const v1 = (extra: Record<string, unknown>, sequence?: string) => ({
    txVersion: 1,
    estimatedFeeSompi: "1000",
    estimatedMass: "0",
    storageMass: "0",
    maxFeeSompi: "1000",
    inputs: [
      {
        outpoint: { transactionId: "a".repeat(64), index: 0 },
        amountSompi: "100000",
        address: "kaspasim:qq",
        scriptPublicKey: "0000aa20" + "bb".repeat(32) + "87",
        kind: "p2sh",
        computeBudget: 10,
        ...(sequence !== undefined ? { sequence } : {})
      }
    ],
    outputs: [{ address: "kaspasim:qq", amountSompi: "99000" }],
    ...extra
  });
  it("a typed lock time passes the shape check; a bare one or one voided by a maximum sequence does not", () => {
    expect(() => assertV1PlanShape(v1({ lockTime: { daaScore: "12" } }))).not.toThrow();
    expect(codeOf(() => assertV1PlanShape(v1({ lockTime: 12 })))).toBe("LOCK_TIME_INVALID");
    expect(codeOf(() => assertV1PlanShape(v1({ lockTime: { daaScore: "12" } }, MAX_TX_IN_SEQUENCE_NUM.toString())))).toBe("LOCK_TIME_VOID_SEQUENCE");
    expect(() => assertV1PlanShape(v1({}))).not.toThrow();
  });
});
