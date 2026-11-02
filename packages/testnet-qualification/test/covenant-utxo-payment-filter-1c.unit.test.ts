import { describe, it, expect, vi } from "vitest";
import { assertSpendableOrFailClosed, createInMemoryReservationLedger, FundingInputRejectedError, type FundingInputRpc } from "../src/funding-input.js";

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). The qualification's funding outpoint is declared, never
// discovered; it is still checked against what the node lists, and a declared outpoint the node lists with a covenant
// id is refused (COVENANT_UTXO): funding a qualification payment from it would end the covenant. Nothing is reserved.
// -----------------------------------------------------------------------------

const ADDRESS = "kaspatest:qrsomeaddress";
const OUTPOINT = { transactionId: "aa".repeat(32), index: 0 };
const COVENANT_ID = "c0".repeat(32);
const row = (extra: Record<string, unknown> = {}) => ({ outpoint: OUTPOINT, amountSompi: 1_000_000_000n, isCoinbase: false, address: ADDRESS, ...extra });
const rpcWith = (rows: any[]): FundingInputRpc => ({ getUtxosByAddress: vi.fn(async () => rows) }) as any;
const spec = { authority: { address: ADDRESS }, declaredOutpoint: OUTPOINT, expectedMinimumSompi: 100_000_000n };

async function outcome(rows: any[]) {
  const ledger = createInMemoryReservationLedger();
  const r = await assertSpendableOrFailClosed({ rpc: rpcWith(rows), spec, localReservation: ledger, runTag: "cuf1c" }).then(
    (evidence) => ({ evidence, error: undefined as any }),
    (error) => ({ evidence: undefined, error })
  );
  return { ...r, reserved: ledger.isReservedForThisRun(OUTPOINT) };
}

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · a covenant's UTXO never funds a qualification", () => {
  it.each([
    ["covenantId (the HardKAS clients' row)", { covenantId: COVENANT_ID }],
    ["covenant_id (snake case)", { covenant_id: COVENANT_ID }],
    ["utxoEntry.covenantId (the node's JSON entry)", { utxoEntry: { covenantId: COVENANT_ID } }]
  ])("CC-Q1: the declared outpoint listed with %s is refused (COVENANT_UTXO) and not reserved", async (_name, extra) => {
    const r = await outcome([row(extra)]);
    expect(r.error).toBeInstanceOf(FundingInputRejectedError);
    expect(r.error?.reason).toBe("COVENANT_UTXO");
    expect(r.error?.detail?.covenantId).toBe(COVENANT_ID);
    expect(r.reserved).toBe(false);
  });

  it("CC-Q2 (control): the same outpoint without a covenant id is accepted and reserved, as before", async () => {
    const r = await outcome([row()]);
    expect(r.error).toBeUndefined();
    expect(r.evidence?.outpoint).toEqual(OUTPOINT);
    expect(r.reserved).toBe(true);
  });
});
