import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildTransactions, estimateTransactionsUpstream } from "../src/kaspa-wallet-adapter.js";

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis, 2026-10-25), at the two low-level Generator functions the SDK exposes
// (`environment` → `buildTransactions`, `estimateTransactions`). They handed their entries to the pinned kaspa-wasm
// Generator as given, and the Generator spends a covenant's UTXO like any other. They now refuse a covenant entry
// (COVENANT_UTXO_NOT_PAYMENT_INPUT), and entries they cannot check (not a list: a live UtxoContext) are refused too
// (COVENANT_UTXO_UNVERIFIED). Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

const k: any = loadManagedKaspaWasmSync();
const NET = "simnet";
const KAS = 100_000_000n;
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addrOf = (name: string): string => new k.PrivateKey(hex(`hk-cuf1b-gen-${name}`)).toPublicKey().toAddress(NET).toString();
const PAYER = addrOf("payer");
const PAYEE = addrOf("payee");
const COVENANT_ID = hex("cuf1b generator covenant");
const spkHex = (address: string) => {
  const spk = k.payToAddressScript(address);
  return Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
};

let serial = 0;
function entry(amount: bigint, covenantId?: string) {
  return {
    address: PAYER,
    outpoint: { transactionId: hex(`cuf1b-gen-${serial++}`), index: 0 },
    amount,
    scriptPublicKey: spkHex(PAYER),
    blockDaaScore: 0n,
    isCoinbase: false,
    ...(covenantId !== undefined ? { covenantId } : {})
  };
}
const settings = (entries: unknown) => ({ networkId: NET, entries, outputs: [{ address: PAYEE, amount: 10n * KAS }], changeAddress: PAYER, priorityFee: 0n });

async function built(entries: unknown) {
  const txs: any[] = [];
  try {
    for await (const pt of buildTransactions(settings(entries))) txs.push(pt);
    return { spent: txs.flatMap((pt) => pt.transaction.inputs.map((i: any) => String(i.previousOutpoint.transactionId))), error: undefined as any };
  } catch (error: any) {
    return { spent: [] as string[], error };
  }
}
async function estimated(entries: unknown) {
  try {
    return { summary: await estimateTransactionsUpstream(settings(entries)), error: undefined as any };
  } catch (error: any) {
    return { summary: undefined, error };
  }
}

describe("COVENANT-UTXO-PAYMENT-FILTER-1B · the low-level Generator functions never take a covenant's UTXO", () => {
  it("CB-T1 buildTransactions refuses a covenant entry (COVENANT_UTXO_NOT_PAYMENT_INPUT) and spends nothing", async () => {
    const covenant = entry(100n * KAS, COVENANT_ID);
    const r = await built([covenant]);
    expect(r.error?.code, r.error ? String(r.error) : `built: the Generator spent ${r.spent.join(", ")}`).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(r.spent).toEqual([]);
  });

  it("CB-T2 estimateTransactionsUpstream refuses a covenant entry too", async () => {
    const r = await estimated([entry(50n * KAS), entry(100n * KAS, COVENANT_ID)]);
    expect(r.error?.code, r.error ? String(r.error) : "estimated over a covenant's UTXO").toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
  });

  it("CB-T3 entries that are not a list (a live UtxoContext) cannot be checked: both refuse (COVENANT_UTXO_UNVERIFIED)", async () => {
    const context = { stands: "for a UtxoContext" };
    expect((await built(context)).error?.code).toBe("COVENANT_UTXO_UNVERIFIED");
    expect((await estimated(context)).error?.code).toBe("COVENANT_UTXO_UNVERIFIED");
  });

  it("CB-T4 control: ordinary entries are built and estimated as before", async () => {
    const ordinary = entry(50n * KAS);
    const b = await built([ordinary]);
    expect(b.error, String(b.error)).toBeUndefined();
    expect(b.spent).toEqual([ordinary.outpoint.transactionId]);
    const e = await estimated([entry(50n * KAS)]);
    expect(e.error, String(e.error)).toBeUndefined();
  });
});
