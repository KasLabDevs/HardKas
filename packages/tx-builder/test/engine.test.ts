import { describe, it, expect } from "vitest";
import { buildTransaction, TransactionEngineConfig } from "../src/engine.js";
import { UTXO } from "@hardkas/core";

// Mock UTXOs
const utxo1: UTXO = { outpoint: { transactionId: "tx1", index: 0 }, amountSompi: "10000", scriptPublicKey: { scriptPublicKey: "spk", version: 0 }, blockDaaScore: 100n, isCoinbase: false };
const utxo2: UTXO = { outpoint: { transactionId: "tx2", index: 1 }, amountSompi: "50000", scriptPublicKey: { scriptPublicKey: "spk", version: 0 }, blockDaaScore: 100n, isCoinbase: false };
const utxo3: UTXO = { outpoint: { transactionId: "tx3", index: 0 }, amountSompi: "5000", scriptPublicKey: { scriptPublicKey: "spk", version: 0 }, blockDaaScore: 100n, isCoinbase: false };
const utxo4: UTXO = { outpoint: { transactionId: "tx4", index: 0 }, amountSompi: "45000", scriptPublicKey: { scriptPublicKey: "spk", version: 0 }, blockDaaScore: 100n, isCoinbase: false };

describe("Agnostic Transaction Engine", () => {

  it("should fail validation for negative intent", () => {
    const config: TransactionEngineConfig = {
      intent: { outputs: [{ address: "kaspa:test", amountSompi: "-500" }] },
      context: { availableUtxos: [utxo1], changeAddress: "kaspa:change" },
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    const res = buildTransaction(config);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Invalid output amount");
  });

  it("should perform exact match selection if sufficient", () => {
    const config: TransactionEngineConfig = {
      intent: { outputs: [{ address: "kaspa:test", amountSompi: "40000" }] },
      context: { availableUtxos: [utxo1, utxo2, utxo3], changeAddress: "kaspa:change" },
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    const res = buildTransaction(config);
    expect(res.ok).toBe(true);
    // Needs 40k + fee. Largest is 50k. So it only needs utxo2.
    expect(res.inputs).toHaveLength(1);
    expect(res.inputs[0].amountSompi).toBe("50000");
    expect(res.change).toBeDefined();
    // 50000 - 40000 - fee = change
    expect(BigInt(res.change!.amountSompi) + BigInt(res.fee) + 40000n).toBe(50000n);
  });

  it("should return insufficient funds when utxos don't cover intent", () => {
    const config: TransactionEngineConfig = {
      intent: { outputs: [{ address: "kaspa:test", amountSompi: "100000" }] },
      context: { availableUtxos: [utxo1, utxo2, utxo3], changeAddress: "kaspa:change" }, // Total 65000
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    const res = buildTransaction(config);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Insufficient funds");
  });

  it("should absorb change into fees when below dust threshold", () => {
    // Total UTXO = 10000. Output = 9500. Remainder = 500. Dust threshold = 600.
    // Fee will eat the 500. (Base fee might be ~600 anyway, so maybe insufficient)
    // Let's force an exact fee and specific intent to test dust.
    const config: TransactionEngineConfig = {
      intent: { outputs: [{ address: "kaspa:test", amountSompi: "8900" }] },
      context: { availableUtxos: [utxo1], changeAddress: "kaspa:change" },
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    const res = buildTransaction(config);
    expect(res.error).toBeUndefined();
    expect(res.ok).toBe(true);
    if (res.change) {
       // If change exists it must be >= 600
       expect(BigInt(res.change.amountSompi)).toBeGreaterThanOrEqual(600n);
    } else {
       // Dust absorbed
       expect(BigInt(res.fee)).toBeGreaterThan(0n);
       expect(BigInt(res.fee) + 8900n).toBe(10000n);
    }
  });

  it("should handle multiple outputs deterministically", () => {
    const config1: TransactionEngineConfig = {
      intent: { outputs: [
        { address: "kaspa:test1", amountSompi: "10000" },
        { address: "kaspa:test2", amountSompi: "20000" }
      ]},
      context: { availableUtxos: [utxo2], changeAddress: "kaspa:change" }, // 50000
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    
    const res1 = buildTransaction(config1);
    
    const config2: TransactionEngineConfig = {
      ...config1,
      // Reverse order of UTXOs to prove order independence
      context: { availableUtxos: [utxo3, utxo2, utxo1], changeAddress: "kaspa:change" }
    };
    const res2 = buildTransaction(config2);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res1.unsignedPayload).toBe(res2.unsignedPayload); // Determinism check
    expect(res1.inputs.length).toBe(1);
    expect(res1.change).toBeDefined();
  });

  it("should reselect additional inputs when recalculated fee exceeds selected value", () => {
    // utxo4 is 45000. Target is 44500.
    // Base selected input: utxo4 (45000).
    // Remaining initially: 500.
    // If the fee estimation for 1 input and 1 output is > 500 (e.g. 660), 
    // it will need to select a second UTXO.
    // Let's provide utxo3 (5000) as well.
    const config: TransactionEngineConfig = {
      intent: { outputs: [{ address: "kaspa:test", amountSompi: "44500" }] },
      context: { availableUtxos: [utxo3, utxo4], changeAddress: "kaspa:change" },
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    const res = buildTransaction(config);
    expect(res.ok).toBe(true);
    // Needs 44500 + ~660 = 45160.
    // utxo4 is 45000 (not enough). So it must pick utxo3 as well.
    expect(res.inputs.length).toBe(2);
    expect(res.inputs.some(u => u.outpoint.transactionId === "tx4")).toBe(true);
    expect(res.inputs.some(u => u.outpoint.transactionId === "tx3")).toBe(true);
  });

  it("should not mutate the provided configuration", () => {
    const config: TransactionEngineConfig = {
      intent: { outputs: [{ address: "kaspa:test", amountSompi: "10000" }] },
      context: { availableUtxos: [utxo2], changeAddress: "kaspa:change" },
      policies: { fee: { exact: 1 }, selection: "largest-first" }
    };
    
    const originalLength = config.context.availableUtxos.length;
    buildTransaction(config);
    expect(config.context.availableUtxos.length).toBe(originalLength);
    expect(config.intent.outputs[0].amountSompi).toBe("10000");
  });

});
