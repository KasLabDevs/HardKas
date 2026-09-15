import { describe, it, expect, vi } from "vitest";
import {
  assertSpendableOrFailClosed,
  createInMemoryReservationLedger,
  FundingInputRejectedError,
  type FundingInputRpc,
  type FundingInputSpec,
  type DeclaredFundingOutpoint
} from "../src/funding-input.js";
import type { DaaObserverUtxoRow } from "../src/daa-observer.js";

const ADDRESS = "kaspatest:qrsomeaddress";
const OUTPOINT: DeclaredFundingOutpoint = { transactionId: "aa".repeat(32), index: 0 };
const OTHER_OUTPOINT: DeclaredFundingOutpoint = { transactionId: "bb".repeat(32), index: 1 };
const SPK = "20abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678ac";
const FIXED_NOW = () => new Date("2026-09-15T13:00:00.000Z");

function utxoRow(overrides: Partial<DaaObserverUtxoRow & { address?: string; scriptPublicKey?: string; isCoinbase?: boolean }> = {}): any {
  return {
    outpoint: OUTPOINT,
    amountSompi: 1_000_000_000n,
    scriptPublicKey: SPK,
    isCoinbase: false,
    address: ADDRESS,
    ...overrides
  };
}

function rpcWith(rows: any[]): FundingInputRpc {
  return { getUtxosByAddress: vi.fn(async () => rows) } as any;
}

function baseSpec(overrides: Partial<FundingInputSpec> = {}): FundingInputSpec {
  return {
    authority: { address: ADDRESS },
    declaredOutpoint: OUTPOINT,
    expectedMinimumSompi: 100_000_000n,
    ...overrides
  };
}

describe("assertSpendableOrFailClosed — happy path", () => {
  it("returns SourceUtxoEvidence when the declared outpoint is spendable", async () => {
    const evidence = await assertSpendableOrFailClosed({
      rpc: rpcWith([utxoRow()]),
      spec: baseSpec(),
      now: FIXED_NOW
    });
    expect(evidence.outpoint).toEqual(OUTPOINT);
    expect(evidence.address).toBe(ADDRESS);
    expect(evidence.amountSompi).toBe(1_000_000_000n);
    expect(evidence.scriptPublicKey).toBe(SPK);
    expect(evidence.isCoinbase).toBe(false);
    expect(evidence.maturityResolvedVia).toBe("not-coinbase");
    expect(evidence.observedAt).toBe("2026-09-15T13:00:00.000Z");
    expect(evidence.localReservation).toBeUndefined();
  });

  it("passes the scriptPublicKey check when it matches", async () => {
    const evidence = await assertSpendableOrFailClosed({
      rpc: rpcWith([utxoRow()]),
      spec: baseSpec({ authority: { address: ADDRESS, expectedScriptPublicKey: SPK } }),
      now: FIXED_NOW
    });
    expect(evidence.scriptPublicKey).toBe(SPK);
  });

  it("enforces coinbase maturity when a context is supplied and the outpoint is mature", async () => {
    const row = utxoRow({ isCoinbase: true, blockDaaScore: 100n });
    const evidence = await assertSpendableOrFailClosed({
      rpc: rpcWith([row]),
      spec: baseSpec({
        maturityContext: { virtualDaaScore: 5000n, coinbaseMaturityBlocks: 1000n }
      }),
      now: FIXED_NOW
    });
    expect(evidence.isCoinbase).toBe(true);
    expect(evidence.maturityResolvedVia).toBe("matured");
    expect(evidence.observedVirtualDaaScore).toBe(5000n);
    expect(evidence.blockDaaScore).toBe(100n);
  });

  it("labels a local reservation as 'tq-local' when a ledger is supplied", async () => {
    const ledger = createInMemoryReservationLedger();
    const evidence = await assertSpendableOrFailClosed({
      rpc: rpcWith([utxoRow()]),
      spec: baseSpec(),
      localReservation: ledger,
      runTag: "run-abc",
      now: FIXED_NOW
    });
    expect(evidence.localReservation).toEqual({ kind: "tq-local", tag: "run-abc" });
    expect(ledger.isReservedForThisRun(OUTPOINT)).toBe(true);
  });
});

describe("assertSpendableOrFailClosed — fail closed", () => {
  it("throws OUTPOINT_NOT_FOUND when the declared outpoint is absent", async () => {
    let thrown: unknown;
    try {
      await assertSpendableOrFailClosed({
        rpc: rpcWith([utxoRow({ outpoint: OTHER_OUTPOINT })]),
        spec: baseSpec(),
        now: FIXED_NOW
      });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(FundingInputRejectedError);
    expect((thrown as FundingInputRejectedError).reason).toBe("OUTPOINT_NOT_FOUND");
  });

  it("throws AMOUNT_INSUFFICIENT when observed amount is below expectedMinimumSompi", async () => {
    await expect(
      assertSpendableOrFailClosed({
        rpc: rpcWith([utxoRow({ amountSompi: 10_000n })]),
        spec: baseSpec({ expectedMinimumSompi: 100_000n }),
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "AMOUNT_INSUFFICIENT" });
  });

  it("throws SCRIPT_MISMATCH when expectedScriptPublicKey does not match observed", async () => {
    await expect(
      assertSpendableOrFailClosed({
        rpc: rpcWith([utxoRow({ scriptPublicKey: "20deadbeef" })]),
        spec: baseSpec({ authority: { address: ADDRESS, expectedScriptPublicKey: SPK } }),
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "SCRIPT_MISMATCH" });
  });

  it("throws COINBASE_IMMATURE when maturity delta is below configured", async () => {
    await expect(
      assertSpendableOrFailClosed({
        rpc: rpcWith([utxoRow({ isCoinbase: true, blockDaaScore: 4500n })]),
        spec: baseSpec({
          maturityContext: { virtualDaaScore: 5000n, coinbaseMaturityBlocks: 1000n }
        }),
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "COINBASE_IMMATURE" });
  });

  it("throws COINBASE_IMMATURE when the coinbase outpoint has no blockDaaScore", async () => {
    // Build a row without blockDaaScore rather than setting it to undefined,
    // to keep exactOptionalPropertyTypes happy.
    const rowWithoutScore = {
      outpoint: OUTPOINT,
      amountSompi: 1_000_000_000n,
      scriptPublicKey: SPK,
      isCoinbase: true,
      address: ADDRESS
    };
    await expect(
      assertSpendableOrFailClosed({
        rpc: rpcWith([rowWithoutScore]),
        spec: baseSpec({
          maturityContext: { virtualDaaScore: 5000n, coinbaseMaturityBlocks: 1000n }
        }),
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "COINBASE_IMMATURE" });
  });

  it("does NOT enforce maturity when the caller omits the context (marked n/a-no-context)", async () => {
    const evidence = await assertSpendableOrFailClosed({
      rpc: rpcWith([utxoRow({ isCoinbase: true, blockDaaScore: 4500n })]),
      spec: baseSpec(),
      now: FIXED_NOW
    });
    expect(evidence.isCoinbase).toBe(true);
    expect(evidence.maturityResolvedVia).toBe("n/a-no-context");
  });

  it("throws ALREADY_LOCAL_RESERVED without hitting the RPC when the ledger says so", async () => {
    const ledger = createInMemoryReservationLedger();
    ledger.reserveForThisRun(OUTPOINT, "prior-run");
    const rpc = rpcWith([utxoRow()]);
    await expect(
      assertSpendableOrFailClosed({
        rpc,
        spec: baseSpec(),
        localReservation: ledger,
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "ALREADY_LOCAL_RESERVED" });
    expect((rpc.getUtxosByAddress as any).mock.calls.length).toBe(0);
  });
});

describe("assertSpendableOrFailClosed — non-discovery invariant", () => {
  it("does NOT accept 'a different, better' UTXO when the declared one is absent", async () => {
    const better = utxoRow({ outpoint: OTHER_OUTPOINT, amountSompi: 999_000_000_000n });
    await expect(
      assertSpendableOrFailClosed({
        rpc: rpcWith([better]),
        spec: baseSpec(),
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "OUTPOINT_NOT_FOUND" });
  });

  it("local reservation is TQ-local, not a consensus claim (label carries 'tq-local' kind)", async () => {
    const ledger = createInMemoryReservationLedger();
    const evidence = await assertSpendableOrFailClosed({
      rpc: rpcWith([utxoRow()]),
      spec: baseSpec(),
      localReservation: ledger,
      now: FIXED_NOW
    });
    // The evidence label must NOT read like a consensus assertion.
    expect(evidence.localReservation?.kind).toBe("tq-local");
  });
});
