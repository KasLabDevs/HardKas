import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo } from "../src/index.js";
import { verifyTxPlanSemantics, verifyTxReceiptSemantics } from "../src/verify.js";

// PAPERCUTS #44 (2026-10-04): artifacts record the simulator as `mode: "simulator"` (legacy
// artifacts: "simulated"). Two checks compared the mode with "simulated" only, so for every
// current artifact they were dead: a simulator plan claiming a real network passed, and a
// simulator receipt without a trace never got MISSING_TRACE.
describe("PAPERCUTS #44 · simulator checks compare the mode artifacts really carry", () => {
  const utxo = createMockUtxo({ address: "kaspa:address1", amountSompi: 100_000_000_000n });
  const request = {
    coinbaseMaturity: 100n,
    fromAddress: "kaspa:address1",
    availableUtxos: [utxo],
    outputs: [{ address: "kaspa:address2", amountSompi: 50_000_000_000n }],
    feeRateSompiPerMass: 1n
  };
  const planOn = (mode: string, networkId: string) => ({ ...buildPaymentPlan(request), mode, networkId }) as any;
  const envIssue = (r: { issues: Array<{ code: string }> }) => r.issues.some((i) => i.code === "ENV_CONSISTENCY_FAILURE");

  it("a simulator plan that claims a real network is an ENV_CONSISTENCY_FAILURE (error)", () => {
    for (const networkId of ["mainnet", "testnet-10", "devnet"]) {
      const r = verifyTxPlanSemantics(planOn("simulator", networkId));
      expect(envIssue(r), networkId).toBe(true);
      expect(r.ok, networkId).toBe(false);
    }
    // the legacy spelling of the mode is covered too
    expect(envIssue(verifyTxPlanSemantics(planOn("simulated", "mainnet")))).toBe(true);
  });

  it("a simulator plan on 'simulated' (or a legacy one on 'simnet') is consistent", () => {
    expect(envIssue(verifyTxPlanSemantics(planOn("simulator", "simulated")))).toBe(false);
    expect(envIssue(verifyTxPlanSemantics(planOn("simulator", "simnet")))).toBe(false);
    expect(envIssue(verifyTxPlanSemantics(planOn("simulated", "simnet")))).toBe(false);
  });

  it("a plan for a node or an RPC network is never held to the simulator rule", () => {
    expect(envIssue(verifyTxPlanSemantics(planOn("rpc", "mainnet")))).toBe(false);
    expect(envIssue(verifyTxPlanSemantics(planOn("localnet", "simnet")))).toBe(false);
  });

  it("MISSING_TRACE: a simulator receipt without tracePath gets the warning; with one, or from a node, it does not", () => {
    const codes = (receipt: any) => verifyTxReceiptSemantics(receipt).issues.map((i) => i.code);
    const without = verifyTxReceiptSemantics({ status: "accepted", txId: "synthetic-1", mode: "simulator" });
    expect(without.issues.map((i) => i.code)).toContain("MISSING_TRACE");
    expect(without.ok).toBe(true); // a warning, not a failure
    expect(codes({ status: "accepted", txId: "synthetic-1", mode: "simulated" })).toContain("MISSING_TRACE");
    expect(codes({ status: "accepted", txId: "synthetic-1", mode: "simulator", tracePath: "/x/trace.json" })).not.toContain("MISSING_TRACE");
    expect(codes({ status: "accepted", txId: "a".repeat(64), mode: "localnet" })).not.toContain("MISSING_TRACE");
    expect(codes({ status: "accepted", txId: "a".repeat(64), mode: "rpc" })).not.toContain("MISSING_TRACE");
  });
});

describe("Transaction Semantic Verification", () => {
  // Relayable amounts: storage mass (KIP-9) makes sub-KAS outputs costly or non-standard.
  const utxo = createMockUtxo({ address: "kaspa:address1", amountSompi: 100_000_000_000n });
  const request = {
    coinbaseMaturity: 100n,
    fromAddress: "kaspa:address1",
    availableUtxos: [utxo],
    outputs: [{ address: "kaspa:address2", amountSompi: 50_000_000_000n }],
    feeRateSompiPerMass: 1n
  };

  it("should pass for a valid plan", () => {
    const plan = buildPaymentPlan(request);

    const result = verifyTxPlanSemantics(plan);
    expect(result.issues).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("should fail on mass mismatch", () => {
    const plan = buildPaymentPlan(request);

    // Corrupt mass
    (plan as any).estimatedMass = 50n;

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "MASS_MISMATCH")).toBe(true);
  });

  it("should detect duplicate inputs", () => {
    const plan = buildPaymentPlan(request);

    // Duplicate first input
    (plan as any).inputs = [...plan.inputs, plan.inputs[0]];

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DUPLICATE_INPUT")).toBe(true);
  });

  it("should detect dust outputs as errors", () => {
    // The planner will not build this (its storage mass is not relayable), so it is handed in.
    const plan = {
      inputs: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 100n }], // Dust
      change: { address: "kaspa:address1", amountSompi: 100_000_000_000n - 100n - 1_000_000n },
      estimatedMass: 10_000n,
      estimatedFeeSompi: 1_000_000n
    };

    const result = verifyTxPlanSemantics(plan as any);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DUST_OUTPUT")).toBe(true);
    expect(result.issues.some((i) => i.code === "MASS_ABOVE_STANDARD_LIMIT")).toBe(true);
  });

  it("should detect dust change as error", () => {
    // Manually construct a plan with dust change
    const plan = {
      inputs: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 100_000_000_000n - 100n - 1_000_000n }],
      change: { address: "kaspa:address1", amountSompi: 100n }, // Dust change
      estimatedMass: 10_000n,
      estimatedFeeSompi: 1_000_000n
    };

    const result = verifyTxPlanSemantics(plan as any);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DUST_CHANGE")).toBe(true);
  });
});
