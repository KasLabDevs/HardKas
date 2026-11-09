import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { TxPlanService, type PlanTransactionRequest } from "../src/service.js";
import type { Utxo } from "../src/index.js";

// RC1-R2 · immature funds are a typed refusal in the SDK's planner too. The CLI refused NO_SPENDABLE_UTXOS ("none mature");
// the planner every SDK caller uses (sdk.tx.plan) threw a plain "Insufficient funds" Error with no code and no word on
// maturity, so an SDK user could not tell immature coinbase outputs from an empty address. Now: code NO_SPENDABLE_UTXOS,
// the counts, and the message (same words) says how many coinbase outputs were left out as immature.

const k: any = loadManagedKaspaWasmSync();
const NET = "simnet";
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addr = (name: string) => new k.PrivateKey(hex(`r2-immature-${name}`)).toPublicKey().toAddress(NET).toString();
const A = addr("miner");
const B = addr("alice");

const utxo = (i: number, over: Partial<Utxo> = {}): Utxo => ({
  outpoint: { transactionId: hex(`r2-utxo-${i}`), index: 0 },
  address: A,
  amountSompi: 50_000_000_000n,
  scriptPublicKey: String(k.payToAddressScript(A).script),
  blockDaaScore: 0n,
  isCoinbase: false,
  ...over
});
const request: PlanTransactionRequest = { fromAddress: A, toAddress: B, amountSompi: 100_000_000n, networkId: NET };
const failure = (p: Promise<unknown>) => p.then(() => undefined, (e) => e as any);

describe("RC1-R2 · NO_SPENDABLE_UTXOS from the planner", () => {
  it("I-1 only immature coinbase outputs: code NO_SPENDABLE_UTXOS, and it says they are immature", async () => {
    const daa = 1_000n;
    const svc = new TxPlanService({ getUtxos: async () => [utxo(1, { isCoinbase: true, blockDaaScore: 990n }), utxo(2, { isCoinbase: true, blockDaaScore: 995n })], getVirtualDaaScore: async () => daa });
    const e = await failure(svc.planTransactionUpstream(request));
    expect(e?.code).toBe("NO_SPENDABLE_UTXOS");
    expect(e?.immatureCoinbase).toBe(2);
    expect(e?.found).toBe(2);
    expect(String(e?.message)).toMatch(/^Insufficient funds: no spendable UTXOs/);
    expect(String(e?.message)).toMatch(/2 coinbase UTXO\(s\) left out as immature/);
  });

  it("I-2 the virtual DAA score cannot be read on a real network: coinbases are left out, and the message says why", async () => {
    const svc = new TxPlanService({
      getUtxos: async () => [utxo(3, { isCoinbase: true, blockDaaScore: 10n })],
      getVirtualDaaScore: async () => {
        throw new Error("node did not answer");
      }
    });
    const e = await failure(svc.planTransactionUpstream(request));
    expect(e?.code).toBe("NO_SPENDABLE_UTXOS");
    expect(String(e?.message)).toMatch(/virtual DAA score could not be read/);
  });

  it("I-3 an empty address: the same code, no maturity note", async () => {
    const svc = new TxPlanService({ getUtxos: async () => [], getVirtualDaaScore: async () => 1_000_000n });
    const e = await failure(svc.planTransactionUpstream(request));
    expect(e?.code).toBe("NO_SPENDABLE_UTXOS");
    expect(e?.immatureCoinbase).toBe(0);
    expect(String(e?.message)).not.toMatch(/immature/);
  });
});
