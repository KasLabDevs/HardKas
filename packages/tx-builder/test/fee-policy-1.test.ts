import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { planWithGenerator } from "../src/generator-plan.js";
import { TxPlanService } from "../src/service.js";
import { v1FeeMass, v1MinimumRelayFee, v1NonContextualMasses } from "../src/v1-mass.js";
import {
  DEFAULT_MAX_FEE_RATE_SOMPI_PER_GRAM,
  DEFAULT_MAX_FEE_SOMPI,
  MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM,
  assertFeeRateWithinBound,
  assertFeeWithinLimitInForce,
  feeLimitInForce,
  generatorFeeRate,
  resolveMaxFeeRate
} from "../src/fee-policy.js";
import type { Utxo } from "../src/index.js";

/*
 * FEE-POLICY-1 · HK-09 / CA-TX-03 / CA-TX-01 (counter-audit X3-02-tx.log). One 1,000 KAS UTXO, one payment + change
 * (simnet, P2PK Schnorr): the relay minimum is 100 sompi/g on max(compute, normalized transient) — 203,600 sompi for this
 * shape — and the storage mass has no relay floor (rusty-kaspa v2.1.0 check_transaction_standard.rs). HardKAS used to hand
 * the Generator feeRate=100, which it charges on the storage mass too: 1,000,000 sompi for 1 KAS, 5,000,000 for 0.2 KAS.
 */

const k: any = loadManagedKaspaWasmSync();
const NET = "simnet";
const KAS = 100_000_000n;
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addrOf = (name: string): string => new k.PrivateKey(hex(`hk-fee-policy-1-${name}`)).toPublicKey().toAddress(NET).toString();
const FROM = addrOf("from");
const TO = addrOf("to");
const spk = (a: string) => String(k.payToAddressScript(a).script);
const big: Utxo = {
  outpoint: { transactionId: hex("fee-policy-1-utxo"), index: 0 },
  address: FROM,
  amountSompi: 1000n * KAS,
  scriptPublicKey: spk(FROM),
  blockDaaScore: 0n,
  isCoinbase: false
};

/** The node's relay minimum for the signed 1-in / 2-out P2PK transaction, by the node's own formula (v1-mass.ts, v0). */
const nodeMinimum = v1MinimumRelayFee(
  v1FeeMass(
    v1NonContextualMasses({
      version: 0,
      inputs: [{ signatureScriptBytes: 66, sigOpCount: 1 }],
      outputs: [{ scriptBytes: 34, covenant: false }, { scriptBytes: 34, covenant: false }],
      payloadBytes: 0
    })
  )
);

const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e: any) {
    return e?.code;
  }
  return undefined;
};

const plan = (amountSompi: bigint, feeRate?: bigint) =>
  planWithGenerator({ networkId: NET, utxos: [big], outputs: [{ address: TO, amountSompi }], changeAddress: FROM, ...(feeRate !== undefined ? { feeRate } : {}) });

describe("FEE-POLICY-1 · the relay minimum is never charged on the storage mass", () => {
  it("the node's relay minimum for this shape is below the Generator's minimum (signature allowance), around 203,600", () => {
    expect(nodeMinimum).toBeGreaterThan(190_000n);
    expect(nodeMinimum).toBeLessThanOrEqual(203_600n);
  });

  for (const [label, amount] of [
    ["0.2 KAS", KAS / 5n],
    ["1 KAS", KAS]
  ] as const) {
    it(`${label}: the default floor (100 sompi/g) pays the relay minimum (203,600), never less`, async () => {
      const atFloor = await plan(amount, MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM);
      const none = await plan(amount);
      expect(atFloor.feeSompi).toBe(203_600n);
      expect(none.feeSompi).toBe(203_600n);
      expect(atFloor.feeSompi).toBeGreaterThanOrEqual(nodeMinimum);
      // storage mass dominates the total mass, yet it is not priced at the floor rate
      expect(atFloor.mass).toBeGreaterThan(2_036n);
    });
    it(`${label}: any rate at or below the minimum (1, 2, 5, 50) is the minimum too`, async () => {
      for (const r of [1n, 2n, 5n, 50n]) expect((await plan(amount, r)).feeSompi).toBe(203_600n);
    });
  }

  it("10 KAS (compute mass dominates): unchanged, 203,600", async () => {
    expect((await plan(10n * KAS, 100n)).feeSompi).toBe(203_600n);
  });

  it("a rate above the minimum is priority, priced as the mempool ranks it (rate × max(compute, storage)), and never below the minimum", async () => {
    const p = await plan(10n * KAS, 500n);
    expect(p.feeSompi).toBe(500n * p.mass);
    expect(p.feeSompi).toBeGreaterThan(203_600n);
  });

  it("the consolidation (sweep) path follows the same rule", async () => {
    const svc = new TxPlanService({ getUtxos: async () => [] });
    const two: Utxo[] = [big, { ...big, outpoint: { transactionId: hex("fee-policy-1-utxo-2"), index: 0 }, amountSompi: KAS / 5n }];
    const a = await svc.planConsolidation({ fromAddress: FROM, selectedUtxos: two, toAddress: FROM, networkId: NET, feeRate: 100n });
    const b = await svc.planConsolidation({ fromAddress: FROM, selectedUtxos: two, toAddress: FROM, networkId: NET });
    expect(a.plan.estimatedFeeSompi).toBe(b.plan.estimatedFeeSompi);
  });

  it("generatorFeeRate: none at or below the minimum, the rate above it", () => {
    expect(generatorFeeRate(undefined)).toBeUndefined();
    expect(generatorFeeRate(1n)).toBeUndefined();
    expect(generatorFeeRate(100n)).toBeUndefined();
    expect(generatorFeeRate(101n)).toBe(101);
  });
});

describe("FEE-POLICY-1 · CA-TX-01: bounded rates and a default total fee limit", () => {
  it("a node rate of 1e6 sompi/g is refused (FEE_RATE_ABOVE_BOUND), never 500 KAS of fee", () => {
    expect(codeOf(() => assertFeeRateWithinBound(1_000_000n, resolveMaxFeeRate(), "the node's fee estimate"))).toBe("FEE_RATE_ABOVE_BOUND");
    expect(() => assertFeeRateWithinBound(DEFAULT_MAX_FEE_RATE_SOMPI_PER_GRAM, resolveMaxFeeRate(), "x")).not.toThrow();
  });

  it("the bound is configurable (networks[<net>].maxFeeRate, or an explicit override) and validated", () => {
    expect(resolveMaxFeeRate({ config: { networks: { simnet: { maxFeeRate: "2000000" } } }, network: "simnet" })).toBe(2_000_000n);
    expect(resolveMaxFeeRate({ override: 300n })).toBe(300n);
    expect(codeOf(() => resolveMaxFeeRate({ config: { networks: { simnet: { maxFeeRate: "-1" } } }, network: "simnet" }))).toBe("INVALID_FEE_RATE");
  });

  it("with no limit configured, the default (0.1 KAS) is in force; a configured one replaces it", () => {
    expect(feeLimitInForce({ config: {}, network: "simnet" })).toEqual({ maxFeeSompi: DEFAULT_MAX_FEE_SOMPI, source: "default" });
    expect(DEFAULT_MAX_FEE_SOMPI).toBe(10_000_000n);
    expect(feeLimitInForce({ config: { networks: { simnet: { maxFeeSompi: "50000000" } } }, network: "simnet" })).toEqual({ maxFeeSompi: 50_000_000n, source: "network-config" });
    expect(feeLimitInForce({ planMaxFeeSompi: 300_000n, config: {}, network: "simnet" })).toEqual({ maxFeeSompi: 300_000n, source: "plan" });
  });

  it("the fee a 1e6 sompi/g rate would buy for a 0.2 KAS payment is refused by the default limit", async () => {
    // even an explicit huge rate (not a node's) never passes silently: 0.2 KAS at 1e6 sompi/g is ~500 KAS of fee
    const p = await plan(KAS / 5n, 1_000_000n).catch((e) => e);
    if (p instanceof Error) {
      expect(String(p.message)).toMatch(/insufficient|fee/i);
    } else {
      expect(codeOf(() => assertFeeWithinLimitInForce(p.feeSompi, feeLimitInForce({ config: {}, network: "simnet" }), "plan", "simnet"))).toBe("FEE_EXCEEDS_MAX");
    }
    const ok = await plan(KAS / 5n);
    expect(() => assertFeeWithinLimitInForce(ok.feeSompi, feeLimitInForce({ config: {}, network: "simnet" }), "plan", "simnet")).not.toThrow();
  });
});
