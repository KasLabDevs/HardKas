import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { TxPlanService, type UtxoProvider } from "../src/service.js";
import { planWithGenerator } from "../src/generator-plan.js";
import { toTxBuilderUtxo } from "../src/utxo-mapper.js";
import type { Utxo } from "../src/index.js";

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1 (2026-10-25). A UTXO the node lists with a covenant id (KIP-20) belongs to a covenant.
// Spending it in an ordinary payment ends the covenant: consensus lets an input go without a continuation unless its
// script forbids it. The pinned kaspa-wasm 2.1.0 Generator selects such a UTXO like any other (the upstream guard,
// rusty-kaspa PR #1074, is on master only), and HardKAS dropped the covenant id before handing UTXOs to it. Payments,
// consolidations and the Generator adapter now never take one. Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

const k: any = loadManagedKaspaWasmSync();
const NET = "simnet";
const KAS = 100_000_000n;
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addrOf = (name: string): string => new k.PrivateKey(hex(`hk-cov-filter-${name}`)).toPublicKey().toAddress(NET).toString();
const scriptOf = (address: string): string => String(k.payToAddressScript(address).script);
const PAYER = addrOf("payer");
const PAYEE = addrOf("payee");
const COVENANT_ID = hex("a covenant id");

let serial = 0;
function utxo(amountSompi: bigint, covenantId?: string): Utxo {
  return {
    outpoint: { transactionId: hex(`cov-filter-${serial++}`), index: 0 },
    address: PAYER,
    amountSompi,
    scriptPublicKey: scriptOf(PAYER),
    blockDaaScore: 0n,
    isCoinbase: false,
    ...(covenantId !== undefined ? { covenantId } : {})
  };
}
const provider = (utxos: Utxo[]): UtxoProvider => ({ async getUtxos() { return utxos; } });
const key = (u: { outpoint: { transactionId: string; index: number } }) => `${u.outpoint.transactionId}:${u.outpoint.index}`;
const pay = (service: TxPlanService, amountSompi: bigint) =>
  service.planTransactionUpstream({ fromAddress: PAYER, toAddress: PAYEE, amountSompi, networkId: NET, feeRate: 1n });

describe("COVENANT-UTXO-PAYMENT-FILTER-1 · a payment never spends a covenant's UTXO", () => {
  it("CF-1 mixed: the covenant UTXO listed first is left out; the plan spends the ordinary one and says so", async () => {
    const covenant = utxo(100n * KAS, COVENANT_ID);
    const ordinary = utxo(50n * KAS);
    const r = await pay(new TxPlanService(provider([covenant, ordinary])), 10n * KAS);
    expect(r.plan.inputs.map(key)).toEqual([key(ordinary)]);
    expect(r.utxoSelection.warnings?.join(" ") ?? "").toMatch(/1 covenant UTXO/);
  });

  it("CF-2 covenant UTXOs only: refused as insufficient funds, naming the exclusion", async () => {
    await expect(pay(new TxPlanService(provider([utxo(100n * KAS, COVENANT_ID)])), 10n * KAS)).rejects.toThrow(/Insufficient funds.*covenant/);
  });

  it("CF-3 control, ordinary UTXOs only: the same plan and selection report as before (no new warning)", async () => {
    const ordinary = [utxo(50n * KAS), utxo(70n * KAS)];
    const r = await pay(new TxPlanService(provider(ordinary)), 10n * KAS);
    expect(r.plan.inputs.map(key)).toEqual([key(ordinary[0]!)]);
    expect(r.utxoSelection.warnings).toBeUndefined();
  });

  it("CF-4 a consolidation handed a covenant UTXO is refused (COVENANT_UTXO_NOT_PAYMENT_INPUT), nothing planned", async () => {
    const service = new TxPlanService(provider([]));
    await expect(
      service.planConsolidation({ fromAddress: PAYER, selectedUtxos: [utxo(5n * KAS), utxo(5n * KAS, COVENANT_ID)], toAddress: PAYER, networkId: NET })
    ).rejects.toMatchObject({ code: "COVENANT_UTXO_NOT_PAYMENT_INPUT" });
  });

  it("CF-5 the Generator adapter refuses a covenant UTXO handed to it directly", async () => {
    await expect(
      planWithGenerator({ networkId: NET, utxos: [utxo(100n * KAS, COVENANT_ID)], outputs: [{ address: PAYEE, amountSompi: 10n * KAS }], changeAddress: PAYER })
    ).rejects.toMatchObject({ code: "COVENANT_UTXO_NOT_PAYMENT_INPUT" });
  });

  it("CF-6 the wallet-query mapper keeps the covenant id, so the planner can see it", () => {
    const mapped = toTxBuilderUtxo({ transactionId: hex("flat"), outputIndex: 1, amountSompi: KAS, scriptPublicKey: scriptOf(PAYER), address: PAYER, covenantId: COVENANT_ID } as any);
    expect(mapped.covenantId).toBe(COVENANT_ID);
  });

  it("CF-7 the covenant id is read from every shape HardKAS handles; absent, null or empty is an ordinary UTXO", async () => {
    const { covenantIdOf, isCovenantUtxo } = await import("../src/covenant-utxos.js");
    expect(covenantIdOf({ covenantId: COVENANT_ID })).toBe(COVENANT_ID);
    expect(covenantIdOf({ covenant_id: COVENANT_ID })).toBe(COVENANT_ID);
    expect(covenantIdOf({ utxoEntry: { covenantId: COVENANT_ID } })).toBe(COVENANT_ID);
    expect(covenantIdOf({ entry: { covenantId: COVENANT_ID } })).toBe(COVENANT_ID);
    expect(covenantIdOf({ covenantId: { toString: () => COVENANT_ID } })).toBe(COVENANT_ID);
    for (const ordinary of [{}, { covenantId: null }, { covenantId: "" }, { covenantId: undefined }, { utxoEntry: { covenantId: null } }, null, undefined, "x"]) {
      expect(isCovenantUtxo(ordinary)).toBe(false);
    }
  });
});
