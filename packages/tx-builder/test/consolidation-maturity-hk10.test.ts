import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { TxPlanService } from "../src/service.js";
import { filterMatureUtxos } from "../src/kaspa-wallet-adapter.js";
import type { Utxo } from "../src/index.js";

/*
 * HK-10 / L1-02 (counter-audit X3-02-tx.log): planConsolidation spent a coinbase 5 DAA old (virtual DAA 2000, coinbase at
 * 1995), which the node refuses (consensus ImmatureCoinbaseSpend: block_daa_score + coinbase_maturity > pov_daa_score;
 * maturity 1000 DAA at 10 BPS). The payment path already filtered it. L1-09: devnet's consensus maturity is 1000, not
 * the SDK's wallet setting of 100.
 */

const k: any = loadManagedKaspaWasmSync();
const KAS = 100_000_000n;
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const FROM = new k.PrivateKey(hex("hk10-from")).toPublicKey().toAddress("simnet").toString();
const spk = String(k.payToAddressScript(FROM).script);
let n = 0;
const coinbase = (blockDaaScore: bigint | undefined, amount = 500n * KAS): Utxo => ({
  outpoint: { transactionId: hex(`hk10-${n++}`), index: 0 },
  address: FROM,
  amountSompi: amount,
  scriptPublicKey: spk,
  ...(blockDaaScore !== undefined ? { blockDaaScore } : {}),
  isCoinbase: true
});

const inputsOf = (r: { plan: { inputs: readonly Utxo[] } }) => r.plan.inputs.map((u) => `${u.isCoinbase ? "coinbase" : "std"}@${u.blockDaaScore}`);

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e?.code;
  }
  return undefined;
}

describe("HK-10 · consolidations never spend an immature coinbase", () => {
  it("X3-02 case: virtual DAA 2000, coinbase@1995 and coinbase@100 → only coinbase@100", async () => {
    const immature = coinbase(1995n);
    const mature = coinbase(100n);
    const svc = new TxPlanService({ getUtxos: async () => [], getVirtualDaaScore: async () => 2000n });
    const r = await svc.planConsolidation({ fromAddress: FROM, selectedUtxos: [immature, mature, coinbase(200n)], toAddress: FROM, networkId: "simnet" });
    expect(inputsOf(r)).toEqual(["coinbase@100", "coinbase@200"]);
    expect(r.utxoSelection.warnings?.join(" ")).toMatch(/1 immature coinbase UTXO\(s\) left out/);
  });

  it("the virtual DAA score can be given with the request (the CLI's read)", async () => {
    const svc = new TxPlanService({ getUtxos: async () => [] });
    const r = await svc.planConsolidation({
      fromAddress: FROM,
      selectedUtxos: [coinbase(1995n), coinbase(100n), coinbase(150n)],
      toAddress: FROM,
      networkId: "simnet",
      virtualDaaScore: 2000n
    });
    expect(inputsOf(r)).toEqual(["coinbase@100", "coinbase@150"]);
  });

  it("only immature coinbases → CONSOLIDATION_IMMATURE_ONLY (nothing planned)", async () => {
    const svc = new TxPlanService({ getUtxos: async () => [], getVirtualDaaScore: async () => 2000n });
    expect(await codeOf(svc.planConsolidation({ fromAddress: FROM, selectedUtxos: [coinbase(1995n), coinbase(1500n)], toAddress: FROM, networkId: "simnet" }))).toBe(
      "CONSOLIDATION_IMMATURE_ONLY"
    );
  });

  it("no virtual DAA score on a real network: coinbases are left out, never spent on a guess", async () => {
    const svc = new TxPlanService({ getUtxos: async () => [] });
    expect(await codeOf(svc.planConsolidation({ fromAddress: FROM, selectedUtxos: [coinbase(1n), coinbase(2n)], toAddress: FROM, networkId: "simnet" }))).toBe(
      "CONSOLIDATION_IMMATURE_ONLY"
    );
  });

  it("a coinbase without a block DAA score is not provably mature: left out", async () => {
    const svc = new TxPlanService({ getUtxos: async () => [], getVirtualDaaScore: async () => 5000n });
    const r = await svc.planConsolidation({ fromAddress: FROM, selectedUtxos: [coinbase(undefined), coinbase(10n), coinbase(20n)], toAddress: FROM, networkId: "simnet" });
    expect(inputsOf(r)).toEqual(["coinbase@10", "coinbase@20"]);
  });

  it("the payment path without a virtual DAA score leaves coinbases out on a real network too", async () => {
    const std: Utxo = { ...coinbase(5n, 10n * KAS), isCoinbase: false };
    const svc = new TxPlanService({ getUtxos: async () => [coinbase(1n), std] });
    const to = new k.PrivateKey(hex("hk10-to")).toPublicKey().toAddress("simnet").toString();
    const r = await svc.planTransactionUpstream({ fromAddress: FROM, toAddress: to, amountSompi: 1n * KAS, networkId: "simnet" });
    expect(inputsOf(r)).toEqual(["std@5"]);
  });
});

describe("L1-09 · devnet coinbase maturity is the consensus value (1000 DAA)", () => {
  it("filterMatureUtxos on devnet uses 1000, not the SDK's 100", () => {
    const r = filterMatureUtxos({ networkId: "devnet", virtualDaaScore: 2000n, utxos: [{ isCoinbase: true, blockDaaScore: 1500n }] });
    expect(r.coinbaseMaturity).toBe(1000n);
    expect(r.immature).toHaveLength(1);
    expect(filterMatureUtxos({ networkId: "simnet", virtualDaaScore: 0n, utxos: [] }).coinbaseMaturity).toBe(1000n);
  });
});
