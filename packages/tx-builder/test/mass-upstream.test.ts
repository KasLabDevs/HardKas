import { describe, it, expect } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildPaymentPlan, calculateUpstreamMass, planSingleOutputSpend, verifyTxPlanSemantics, type Utxo } from "../src/index.js";

/**
 * M4: mass and minimum fee come from the pinned kaspa-wasm SDK, never from
 * HardKAS constants. The oracle values below were observed from rusty-kaspad
 * rejecting HardKAS transactions, so they pin HardKAS to the node, not to
 * itself.
 */

// Gauntlet funding transaction (2026-09-11): 21 mature coinbase UTXOs of 50 KAS,
// 1000 KAS to the recipient. The node rejected HardKAS's own plan with
// "under the required amount of 2439600 for compute mass 24396".
const FIXTURE_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const FIXTURE_SPK = "000020dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659ac";
const RECIPIENT = "kaspasim:qzgh3e6qqe6jfevf0dc652uszm0lnhvhzmasga5lka4kcl5udget5065p52eh";
const GAUNTLET_TXID = "02a340d9b05213af3aeb28880d3b18a065ce7d7593d12580bf5936baf6063880";

const gauntletUtxos: Utxo[] = Array.from({ length: 21 }, (_, index) => ({
  outpoint: { transactionId: GAUNTLET_TXID, index },
  address: FIXTURE_ADDRESS,
  amountSompi: 5_000_000_000n,
  scriptPublicKey: FIXTURE_SPK,
  blockDaaScore: 226n,
  isCoinbase: true
}));

const gauntletRequest = {
  fromAddress: FIXTURE_ADDRESS,
  outputs: [{ address: RECIPIENT, amountSompi: 100_000_000_000n }],
  availableUtxos: gauntletUtxos,
  feeRateSompiPerMass: 100n,
  coinbaseMaturity: 1000n,
  networkId: "simnet"
};

describe("M4: mass/fee authority is the pinned SDK", () => {
  it("matches the node on the gauntlet transaction: mass 24396, fee 2439600", () => {
    const plan = buildPaymentPlan(gauntletRequest);

    expect(plan.inputs).toHaveLength(21);
    expect(plan.estimatedMass).toBe(24396n);
    expect(plan.estimatedFeeSompi).toBe(2439600n);

    // Exact conservation: inputs = outputs + change + fee
    const inputs = plan.inputs.reduce((s, u) => s + u.amountSompi, 0n);
    const outputs = plan.outputs.reduce((s, o) => s + o.amountSompi, 0n);
    expect(inputs - outputs - (plan.change?.amountSompi ?? 0n)).toBe(plan.estimatedFeeSompi);
  });

  it("matches the node on the rc17 rejection: 1 P2PK input, 2 P2PK outputs = mass 2036", () => {
    const r = calculateUpstreamMass({
      networkId: "simnet",
      inputs: [{ amountSompi: 5_000_000_000n, scriptPublicKey: FIXTURE_SPK }],
      outputs: [
        { amountSompi: 2_500_000_000n, address: RECIPIENT },
        { amountSompi: 2_499_000_000n, address: FIXTURE_ADDRESS }
      ]
    });
    expect(r.mass).toBe(2036n);
    expect(r.minimumFeeSompi).toBe(203600n);
  });

  it("computes on the unsigned transaction: the SDK would double-count signatures on a signed one", () => {
    const k = loadManagedKaspaWasmSync();
    const pk = new k.PrivateKey("b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef");
    const script = FIXTURE_SPK.slice(4);
    const build = () =>
      new k.Transaction({
        version: 0,
        inputs: [{
          previousOutpoint: { transactionId: GAUNTLET_TXID, index: 0 },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1,
          utxo: {
            address: FIXTURE_ADDRESS,
            outpoint: { transactionId: GAUNTLET_TXID, index: 0 },
            amount: 5_000_000_000n,
            scriptPublicKey: new k.ScriptPublicKey(0, script),
            blockDaaScore: 0n,
            isCoinbase: false
          }
        }],
        outputs: [{ value: 4_999_000_000n, scriptPublicKey: new k.ScriptPublicKey(0, script) }],
        lockTime: 0n,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: 0n,
        payload: ""
      });

    const unsignedMass = k.calculateTransactionMass("simnet", build(), 1);
    const signedMass = k.calculateTransactionMass("simnet", k.signTransaction(build(), [pk], true), 1);
    // The SDK adds one expected signature (66 bytes) per input on top of any present.
    expect(signedMass - unsignedMass).toBe(66n);

    const ours = calculateUpstreamMass({
      networkId: "simnet",
      inputs: [{ amountSompi: 5_000_000_000n, outpoint: { transactionId: GAUNTLET_TXID, index: 0 }, scriptPublicKey: FIXTURE_SPK }],
      outputs: [{ amountSompi: 4_999_000_000n, address: FIXTURE_ADDRESS }]
    });
    expect(ours.mass).toBe(unsignedMass);
  });

  it("treats outpoint ids and unparseable identities as mass-neutral placeholders, and says so", () => {
    const real = calculateUpstreamMass({
      networkId: "simnet",
      inputs: [{ amountSompi: 5_000_000_000n, outpoint: { transactionId: GAUNTLET_TXID, index: 0 }, scriptPublicKey: FIXTURE_SPK }],
      outputs: [{ amountSompi: 4_000_000_000n, address: RECIPIENT }]
    });
    const mock = calculateUpstreamMass({
      networkId: "simulated",
      inputs: [{ amountSompi: 5_000_000_000n, outpoint: { transactionId: "mock-alice-0", index: 0 }, scriptPublicKey: "mock-script" }],
      outputs: [{ amountSompi: 4_000_000_000n, address: "kaspa:sim_bob" }]
    });
    expect(mock.mass).toBe(real.mass);
    expect(real.assumptions).toEqual([]);
    expect(mock.assumptions.length).toBe(3);
  });

  it("includes storage mass, which depends on amounts (KIP-9)", () => {
    // Same shape as the rc17 oracle (compute mass 2036), but a 1 KAS output:
    // storage mass ~ C/amount = 10^12/10^8 = 10000 grams dominates.
    const oneKas = calculateUpstreamMass({
      networkId: "simnet",
      inputs: [{ amountSompi: 500_000_000n, scriptPublicKey: FIXTURE_SPK }],
      outputs: [
        { amountSompi: 100_000_000n, address: RECIPIENT },
        { amountSompi: 399_000_000n, address: FIXTURE_ADDRESS }
      ]
    });
    expect(oneKas.mass).toBeGreaterThan(10_000n);

    // Two 0.001 KAS outputs are not relayable at all.
    expect(() =>
      calculateUpstreamMass({
        networkId: "simnet",
        inputs: [{ amountSompi: 100_000_000n, scriptPublicKey: FIXTURE_SPK }],
        outputs: [
          { amountSompi: 100_000n, address: RECIPIENT },
          { amountSompi: 100_000n, address: FIXTURE_ADDRESS }
        ]
      })
    ).toThrow(/TX_MASS_ABOVE_STANDARD_LIMIT/);
  });

  it("refuses to price a transaction without inputs instead of letting the SDK abort", () => {
    expect(() => calculateUpstreamMass({ inputs: [], outputs: [{ amountSompi: 1n, address: RECIPIENT }] })).toThrow(
      /MASS_REQUIRES_INPUTS/
    );
  });

  it("refuses a fee override below the node's minimum", () => {
    expect(() => buildPaymentPlan({ ...gauntletRequest, feeOverrideSompi: 2425200n })).toThrow(/FEE_BELOW_NETWORK_MINIMUM/);
    const plan = buildPaymentPlan({ ...gauntletRequest, feeOverrideSompi: 2439600n });
    expect(plan.estimatedFeeSompi).toBe(2439600n);
  });

  it("charges the whole remainder as fee when change would be dust, keeping value conservation exact", () => {
    const utxos: Utxo[] = [{ ...gauntletUtxos[0]!, amountSompi: 1_000_203_900n, isCoinbase: false }];
    const plan = buildPaymentPlan({
      ...gauntletRequest,
      outputs: [{ address: RECIPIENT, amountSompi: 1_000_000_000n }],
      availableUtxos: utxos
    });
    expect(plan.change).toBeUndefined();
    expect(plan.estimatedFeeSompi).toBe(203_900n);
    const minimum = calculateUpstreamMass({
      networkId: "simnet",
      inputs: [{ amountSompi: utxos[0]!.amountSompi, scriptPublicKey: FIXTURE_SPK }],
      outputs: [{ amountSompi: 1_000_000_000n, address: RECIPIENT }]
    }).minimumFeeSompi;
    expect(plan.estimatedFeeSompi >= minimum).toBe(true);
  });

  it("verification recomputes with the SDK and flags a fee below the node's minimum", () => {
    const plan = buildPaymentPlan(gauntletRequest);
    const ok = verifyTxPlanSemantics({ ...plan, networkId: "simnet" } as any);
    expect(ok.issues.map((i) => i.code)).toEqual([]);

    // The pre-M4 plan: HardKAS's own mass (24252) and fee (2425200).
    const underpaid = {
      ...plan,
      networkId: "simnet",
      estimatedMass: 24252n,
      estimatedFeeSompi: 2425200n,
      change: { ...plan.change!, amountSompi: plan.change!.amountSompi + 14400n }
    };
    const codes = verifyTxPlanSemantics(underpaid as any).issues.map((i) => i.code);
    expect(codes).toContain("MASS_MISMATCH");
    expect(codes).toContain("FEE_BELOW_NETWORK_MINIMUM");
  });

  it("settles a single-output spend against the SDK", () => {
    const spend = planSingleOutputSpend({ inputs: gauntletUtxos, toAddress: RECIPIENT, feeRateSompiPerMass: 100n, networkId: "simnet" });
    const total = gauntletUtxos.reduce((s, u) => s + u.amountSompi, 0n);
    expect(spend.sendSompi + spend.feeSompi).toBe(total);
    const check = calculateUpstreamMass({
      networkId: "simnet",
      inputs: gauntletUtxos.map((u) => ({ amountSompi: u.amountSompi, scriptPublicKey: u.scriptPublicKey })),
      outputs: [{ amountSompi: spend.sendSompi, address: RECIPIENT }]
    });
    expect(spend.feeSompi >= check.minimumFeeSompi).toBe(true);
    expect(spend.mass).toBe(check.mass);
  });
});
