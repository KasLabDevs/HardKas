import { describe, it, expect } from "vitest";
import { TxPlanService, type UtxoProvider } from "../src/service.js";
import type { Utxo } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

/**
 * M10-B-completion (A′) — planner dispatch matrix.
 *
 * The claim we protect: real Kaspa networks never reach the synthetic
 * planner. `planTransactionUpstream` fails closed on bad input; there is no
 * automatic fallback from upstream to synthetic. Simulated-only harnesses
 * may use `planTransactionSynthetic` explicitly, and it is labelled
 * NON-AUTHORITATIVE via `plannerAuthority = SYNTHETIC_SIMULATOR`.
 */

const REAL_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const SYNTHETIC_ADDRESS = "kaspa:sim_alice"; // bech32-invalid on purpose

function mockProvider(utxos: Utxo[]): UtxoProvider {
  return { async getUtxos() { return utxos; } };
}

function realUtxos(count: number, sompi: bigint): Utxo[] {
  const k = loadManagedKaspaWasmSync();
  const spk = String(k.payToAddressScript(REAL_ADDRESS).script);
  return Array.from({ length: count }, (_, i) => ({
    outpoint: { transactionId: (i + 1).toString(16).padStart(64, "0"), index: 0 },
    address: REAL_ADDRESS,
    amountSompi: sompi,
    scriptPublicKey: spk,
    blockDaaScore: 0n,
    isCoinbase: false
  }));
}

function syntheticUtxos(count: number, sompi: bigint): Utxo[] {
  return Array.from({ length: count }, (_, i) => ({
    outpoint: { transactionId: (i + 1).toString(16).padStart(64, "0"), index: 0 },
    address: SYNTHETIC_ADDRESS,
    amountSompi: sompi,
    scriptPublicKey: "mock-script",
    blockDaaScore: 0n,
    isCoinbase: false
  }));
}

describe("TxPlanService planner dispatch (M10-B-completion A′)", () => {
  it("simulated + kaspa:sim_alice → synthetic planner PASS with SYNTHETIC_SIMULATOR authority", async () => {
    const svc = new TxPlanService(mockProvider(syntheticUtxos(3, 500_000_000_000n)), { coinbaseMaturity: 1000n });
    const result = await svc.planTransactionSynthetic({
      fromAddress: SYNTHETIC_ADDRESS,
      toAddress: SYNTHETIC_ADDRESS,
      amountSompi: 1_000_000_000n,
      networkId: "simulated",
      feeRate: 1n
    });
    expect(result.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    expect(result.plannerAuthorityDetail).toContain("hardkas.simulator");
    expect(result.plan.estimatedFeeSompi).toBeGreaterThan(0n);
  });

  it("real network + malformed synthetic address → upstream FAIL CLOSED, NO fallback", async () => {
    const svc = new TxPlanService(mockProvider(syntheticUtxos(3, 500_000_000_000n)), { coinbaseMaturity: 1000n });
    await expect(
      svc.planTransactionUpstream({
        fromAddress: SYNTHETIC_ADDRESS,
        toAddress: SYNTHETIC_ADDRESS,
        amountSompi: 1_000_000_000n,
        networkId: "simnet",
        feeRate: 1n
      })
    ).rejects.toThrow(); // Generator's own address-parsing failure surfaces; no silent downgrade.
  });

  it("real network + valid address → upstream planner PASS with KASPA_WASM_GENERATOR authority", async () => {
    const svc = new TxPlanService(mockProvider(realUtxos(3, 500_000_000_000n)), { coinbaseMaturity: 1000n });
    const result = await svc.planTransactionUpstream({
      fromAddress: REAL_ADDRESS,
      toAddress: REAL_ADDRESS,
      amountSompi: 1_000_000_000n,
      networkId: "simnet",
      feeRate: 1n
    });
    expect(result.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(result.plannerAuthorityDetail).toMatch(/^kaspa-wasm@/);
    expect(result.utxoSelection.selectionStrategy).toBe("upstream-generator");
  });

  it("synthetic planner never claims KASPA_WASM_GENERATOR authority even with real addresses", async () => {
    const svc = new TxPlanService(mockProvider(realUtxos(3, 500_000_000_000n)), { coinbaseMaturity: 1000n });
    const result = await svc.planTransactionSynthetic({
      fromAddress: REAL_ADDRESS,
      toAddress: REAL_ADDRESS,
      amountSompi: 1_000_000_000n,
      networkId: "simnet",
      feeRate: 1n
    });
    expect(result.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    expect((result.plannerAuthority as string) === "KASPA_WASM_GENERATOR").toBe(false);
  });

  it("upstream and synthetic authorities are disjoint (KASPA_WASM_GENERATOR ≠ SYNTHETIC_SIMULATOR)", async () => {
    const svc = new TxPlanService(mockProvider(realUtxos(3, 500_000_000_000n)), { coinbaseMaturity: 1000n });
    const [upstream, synthetic] = await Promise.all([
      svc.planTransactionUpstream({
        fromAddress: REAL_ADDRESS,
        toAddress: REAL_ADDRESS,
        amountSompi: 1_000_000_000n,
        networkId: "simnet",
        feeRate: 1n
      }),
      svc.planTransactionSynthetic({
        fromAddress: REAL_ADDRESS,
        toAddress: REAL_ADDRESS,
        amountSompi: 1_000_000_000n,
        networkId: "simnet",
        feeRate: 1n
      })
    ]);
    expect(upstream.plannerAuthority === synthetic.plannerAuthority).toBe(false);
    expect(new Set([upstream.plannerAuthority, synthetic.plannerAuthority]).size).toBe(2);
  });
});
