import { describe, it, expect } from "vitest";
import {
  estimateTransactionMass,
  calculateUpstreamMass,
  buildPaymentPlan,
  createMockUtxo,
  MASS_AUTHORITY
} from "../src/index.js";

// Addresses the SDK accepts, so no placeholder is involved.
const ALICE = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const BOB = "kaspasim:qzgh3e6qqe6jfevf0dc652uszm0lnhvhzmasga5lka4kcl5udget5065p52eh";

describe("Mass Estimation (shape only, computed by the pinned SDK)", () => {
  it("names the SDK as the authority", () => {
    expect(MASS_AUTHORITY).toBe("kaspa-wasm 2.0.1");
    const result = estimateTransactionMass({ inputCount: 1, outputs: [{ address: BOB }] });
    expect(result.assumptions[0]).toMatch(/kaspa-wasm 2\.0\.1/);
  });

  it("single input / single P2PK output", () => {
    const result = estimateTransactionMass({ inputCount: 1, outputs: [{ address: BOB }], hasChange: false });
    expect(result.mass).toBe(1624n);
    expect(result.feeSompi).toBe(162400n);
  });

  it("a change output makes it the rc17 shape the node priced at 2036", () => {
    const result = estimateTransactionMass({ inputCount: 1, outputs: [{ address: BOB }], hasChange: true });
    expect(result.mass).toBe(2036n);
  });

  it("an identity the SDK cannot parse is sized as P2PK and reported", () => {
    const real = estimateTransactionMass({ inputCount: 1, outputs: [{ address: BOB }] });
    const invalid = estimateTransactionMass({ inputCount: 1, outputs: [{ address: "kaspa:ppvkp8f..." }] });
    expect(invalid.mass).toBe(real.mass);
    expect(invalid.assumptions.join(" ")).toMatch(/not a Kaspa address/);
  });

  it("breakdown is derived from SDK totals and adds up", () => {
    const r = estimateTransactionMass({ inputCount: 3, outputs: [{ address: BOB }], hasChange: true, payloadBytes: 40 });
    const b = r.breakdown;
    expect(b.base + b.inputs + b.outputs + b.payload).toBe(b.total);
    expect(b.total).toBe(r.mass);
    expect(b.payload).toBeGreaterThan(0n);
  });

  it("should be deterministic across runs", () => {
    const params = { inputCount: 5, outputs: [{ address: "addr1" }, { address: "addr2" }], hasChange: true };
    const res1 = estimateTransactionMass(params);
    const res2 = estimateTransactionMass(params);
    expect(res1).toEqual(res2);
  });

  it("keeps mass and fee after a 1 sompi output change when storage mass is negligible", () => {
    // At hundreds of KAS, storage mass (~C/amount) is far below compute mass.
    const utxos = [createMockUtxo({ address: ALICE, amountSompi: 50_000_000_000n })];
    const base = { coinbaseMaturity: 100n, fromAddress: ALICE, availableUtxos: utxos, feeRateSompiPerMass: 1n };

    const plan1 = buildPaymentPlan({ ...base, outputs: [{ address: BOB, amountSompi: 20_000_000_000n }] });
    const plan2 = buildPaymentPlan({ ...base, outputs: [{ address: BOB, amountSompi: 20_000_000_001n }] });

    expect(plan1.estimatedMass).toBe(plan2.estimatedMass);
    expect(plan1.estimatedFeeSompi).toBe(plan2.estimatedFeeSompi);
  });

  it("the plan's mass is the SDK mass of the plan's own transaction", () => {
    const utxos = [createMockUtxo({ address: ALICE, amountSompi: 500_000_000n })];
    const plan = buildPaymentPlan({
      coinbaseMaturity: 100n,
      fromAddress: ALICE,
      availableUtxos: utxos,
      feeRateSompiPerMass: 1n,
      outputs: [{ address: BOB, amountSompi: 100_000_000n }]
    });
    const direct = calculateUpstreamMass({
      networkId: "simnet",
      inputs: plan.inputs.map((u) => ({ amountSompi: u.amountSompi, outpoint: u.outpoint, scriptPublicKey: u.scriptPublicKey })),
      outputs: [
        ...plan.outputs.map((o) => ({ amountSompi: o.amountSompi, address: o.address })),
        ...(plan.change ? [{ amountSompi: plan.change.amountSompi, address: plan.change.address }] : [])
      ]
    });
    expect(plan.estimatedMass).toBe(direct.mass);
    // A rate below the node's minimum cannot lower the fee below it.
    expect(plan.estimatedFeeSompi).toBe(direct.minimumFeeSompi);
  });
});
