import { describe, it, expect } from "vitest";
import { TxPlanService, type UtxoProvider } from "../src/service.js";
import type { Utxo } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

// M10-B-completion (A′): shadow/differential comparison of the legacy planner
// (largest-first + fee convergence + buildPaymentPlan) vs the upstream planner
// (kaspa-wasm Generator). Same intent, same UTXO set. We do NOT require identical
// selection (Generator may pick a different valid subset); we require that both
// produce a plan that satisfies conservation (in >= out + fee), covers the
// target, respects the maturity filter, and yields the same intended output.

const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const FIXTURE_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const RECIPIENT = FIXTURE_ADDRESS; // send-to-self keeps scriptPublicKey stable across shapes
const NETWORK = "simnet";
const COINBASE_MATURITY = 1000n;

function fakeUtxos(count: number, sompiEach: bigint, isCoinbase = false, blockDaaScore = 0n): Utxo[] {
  const k = loadManagedKaspaWasmSync();
  const spk = String(k.payToAddressScript(FIXTURE_ADDRESS).script);
  return Array.from({ length: count }, (_, i) => ({
    outpoint: { transactionId: (i + 1).toString(16).padStart(64, "0"), index: 0 },
    address: FIXTURE_ADDRESS,
    amountSompi: sompiEach,
    scriptPublicKey: spk,
    blockDaaScore,
    isCoinbase
  }));
}

function mockProvider(utxos: Utxo[], virtualDaaScore?: bigint): UtxoProvider {
  return {
    async getUtxos() {
      return utxos;
    },
    ...(virtualDaaScore !== undefined ? { async getVirtualDaaScore() { return virtualDaaScore; } } : {})
  };
}

async function planBoth(utxos: Utxo[], amountSompi: bigint, opts?: { virtualDaaScore?: bigint; excludeOutpoints?: Set<string> }) {
  const service = new TxPlanService(mockProvider(utxos, opts?.virtualDaaScore), { coinbaseMaturity: COINBASE_MATURITY });
  const request = {
    fromAddress: FIXTURE_ADDRESS,
    toAddress: RECIPIENT,
    amountSompi,
    networkId: NETWORK,
    feeRate: 1n,
    ...(opts?.excludeOutpoints ? { excludeOutpoints: opts.excludeOutpoints } : {})
  };
  const legacy = await service.planTransaction(request);
  const upstream = await service.planTransactionUpstream(request);
  return { legacy, upstream };
}

describe("TxPlanService differential (M10-B-completion A′)", () => {
  it("annotates plannerAuthority only on the upstream path", async () => {
    const utxos = fakeUtxos(3, 500_000_000_000n);
    const { legacy, upstream } = await planBoth(utxos, 1_000_000_000n);
    expect(legacy.plannerAuthority).toBeUndefined();
    expect(upstream.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(upstream.plannerAuthorityDetail).toMatch(/^kaspa-wasm@/);
    expect(upstream.utxoSelection.selectionStrategy).toBe("upstream-generator");
  });

  it("upstream plan preserves the requested output amount to the recipient", async () => {
    const utxos = fakeUtxos(3, 500_000_000_000n);
    const target = 1_000_000_000n;
    const { upstream } = await planBoth(utxos, target);
    expect(upstream.plan.outputs.length).toBe(1);
    expect(upstream.plan.outputs[0]!.address).toBe(RECIPIENT);
    expect(upstream.plan.outputs[0]!.amountSompi).toBe(target);
  });

  it("upstream conservation: sum(inputs) == sum(outputs) + change + fee", async () => {
    const utxos = fakeUtxos(3, 500_000_000_000n);
    const target = 1_000_000_000n;
    const { upstream } = await planBoth(utxos, target);
    const totalIn = upstream.plan.inputs.reduce((s, u) => s + u.amountSompi, 0n);
    const totalOut = upstream.plan.outputs.reduce((s, o) => s + o.amountSompi, 0n);
    const change = upstream.plan.change?.amountSompi ?? 0n;
    expect(totalIn).toBe(totalOut + change + upstream.plan.estimatedFeeSompi);
  });

  it("upstream and legacy agree on target and conservation, allowing selection to differ", async () => {
    const utxos = fakeUtxos(3, 500_000_000_000n);
    const target = 1_000_000_000n;
    const { legacy, upstream } = await planBoth(utxos, target);
    // Both must cover the exact target.
    expect(upstream.plan.outputs[0]!.amountSompi).toBe(target);
    expect(legacy.plan.outputs[0]!.amountSompi).toBe(target);
    // Selection may differ; conservation must hold on both.
    for (const p of [legacy.plan, upstream.plan]) {
      const totalIn = p.inputs.reduce((s, u) => s + u.amountSompi, 0n);
      const totalOut = p.outputs.reduce((s, o) => s + o.amountSompi, 0n);
      const change = p.change?.amountSompi ?? 0n;
      expect(totalIn).toBe(totalOut + change + p.estimatedFeeSompi);
      expect(p.estimatedMass).toBeGreaterThan(0n);
      expect(p.estimatedFeeSompi).toBeGreaterThan(0n);
    }
  });

  it("upstream honors excludeOutpoints pre-filter (no re-selection after Generator)", async () => {
    const utxos = fakeUtxos(3, 500_000_000_000n);
    const excluded = `${utxos[0]!.outpoint.transactionId}:0`;
    const target = 1_000_000_000n;
    const { upstream } = await planBoth(utxos, target, { excludeOutpoints: new Set([excluded]) });
    const selectedKeys = upstream.plan.inputs.map((u) => `${u.outpoint.transactionId}:${u.outpoint.index}`);
    expect(selectedKeys).not.toContain(excluded);
    expect(upstream.utxoSelection.warnings?.[0]).toMatch(/excluded from candidate set/);
  });

  it("upstream rejects insufficient funds with our error code", async () => {
    const utxos = fakeUtxos(1, 1_000n); // way below target
    await expect(planBoth(utxos, 10_000_000_000n)).rejects.toThrow(/Insufficient funds/);
  });

  it("upstream filters immature coinbase using upstream network params", async () => {
    // Very low virtual DAA vs blockDaaScore=0 with coinbase=true: with simnet
    // maturity (1000 per HardKAS default), delta 0 is immature → not selected.
    const utxos = fakeUtxos(1, 500_000_000_000n, /* isCoinbase */ true, /* blockDaaScore */ 0n);
    const service = new TxPlanService(mockProvider(utxos, /* virtualDaaScore */ 10n), { coinbaseMaturity: COINBASE_MATURITY });
    await expect(
      service.planTransactionUpstream({
        fromAddress: FIXTURE_ADDRESS,
        toAddress: RECIPIENT,
        amountSompi: 1_000_000_000n,
        networkId: NETWORK,
        feeRate: 1n
      })
    ).rejects.toThrow(/Insufficient funds|no spendable UTXOs/);
  });
});
