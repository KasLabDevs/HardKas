import { describe, it, expect } from "vitest";
import { TxPlanService, type UtxoProvider } from "../src/service.js";
import { type Utxo } from "../src/index.js";

// Helper to create mock UTXOs
function createUtxo(amount: bigint): Utxo {
  return {
    outpoint: { transactionId: "00".repeat(32), index: 0 },
    address: "kaspatest:qq...",
    amountSompi: amount,
    scriptPublicKey: "00",
    isCoinbase: false
  };
}

class MockProvider implements UtxoProvider {
  constructor(public utxos: Utxo[]) {}
  async getUtxos() {
    return this.utxos;
  }
}

describe("TxPlanService - Fee Convergence Loop", () => {
  const defaultOptions = { coinbaseMaturity: 100n };

  it("Case A: 1 input sufficient initially -> fee rises -> needs 2 inputs -> converges", async () => {
    const utxos = [createUtxo(1010n), createUtxo(1000n)];
    const service = new TxPlanService(new MockProvider(utxos), defaultOptions);
    
    let callCount = 0;
    const mockFeeEstimator = async (inputs: number, outputs: number) => {
      callCount++;
      return BigInt(inputs * 20);
    };

    const result = await service.planTransaction({
      fromAddress: "kaspatest:foo",
      toAddress: "kaspatest:bar",
      amountSompi: 1000n,
      feeEstimator: mockFeeEstimator
    });

    expect(result.utxoSelection.selectedUtxos).toBe(2);
    expect(callCount).toBe(3); // 1 input -> 2 inputs -> 2 inputs (converged)
  });

  it("Case B: Many small UTXOs -> 3 -> 4 -> 5 inputs -> converges", async () => {
    const utxos = Array(6).fill(createUtxo(30n));
    const service = new TxPlanService(new MockProvider(utxos), defaultOptions);
    
    const mockFeeEstimator = async (inputs: number, outputs: number) => {
      return BigInt(inputs * 10);
    };

    const result = await service.planTransaction({
      fromAddress: "kaspatest:foo",
      toAddress: "kaspatest:bar",
      amountSompi: 100n,
      feeEstimator: mockFeeEstimator
    });

    expect(result.utxoSelection.selectedUtxos).toBe(5);
  });

  it("Case C: Change output logic causes shape change (simulated via fee estimator)", async () => {
    const utxos = [createUtxo(500n), createUtxo(500n)];
    const service = new TxPlanService(new MockProvider(utxos), defaultOptions);
    
    const mockFeeEstimator = async (inputs: number, outputs: number) => {
      return inputs === 1 ? 100n : 200n;
    };

    const result = await service.planTransaction({
      fromAddress: "kaspatest:foo",
      toAddress: "kaspatest:bar",
      amountSompi: 450n,
      feeEstimator: mockFeeEstimator
    });

    expect(result.utxoSelection.selectedUtxos).toBe(2);
  });

  it("Case D: Truly insufficient funds after fee recalculation (clean failure)", async () => {
    const utxos = [createUtxo(1010n)];
    const service = new TxPlanService(new MockProvider(utxos), defaultOptions);
    
    const mockFeeEstimator = async (inputs: number, outputs: number) => {
      return 20n;
    };

    await expect(service.planTransaction({
      fromAddress: "kaspatest:foo",
      toAddress: "kaspatest:bar",
      amountSompi: 1000n,
      feeEstimator: mockFeeEstimator
    })).rejects.toThrow(/Insufficient funds/);
  });

  it("Case E (Malicious): Oscillating fee estimator hits MAX_FEE_SELECTION_PASSES and throws Convergence Error", async () => {
    const utxos = [createUtxo(1060n), createUtxo(100n)];
    const service = new TxPlanService(new MockProvider(utxos), defaultOptions);
    
    const mockFeeEstimator = async (inputs: number, outputs: number) => {
      return inputs === 1 ? 100n : 0n;
    };

    await expect(service.planTransaction({
      fromAddress: "kaspatest:foo",
      toAddress: "kaspatest:bar",
      amountSompi: 1000n,
      feeEstimator: mockFeeEstimator
    })).rejects.toThrow(/FeeSelectionDidNotConvergeError/);
  });
});
