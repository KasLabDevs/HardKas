import { describe, it, expect, vi } from "vitest";
import { TxPlanService, UtxoProvider } from "../src/service.js";
import { Utxo } from "../src/index.js";

describe("TxPlanService", () => {
  it("should select largest UTXOs first and enforce MAX_INPUTS_PER_TX", async () => {
    const mockUtxos: Utxo[] = Array.from({ length: 5400 }, (_, i) => ({
      outpoint: { transactionId: `tx-${i}`, index: 0 },
      address: "kaspa:qrcx...",
      amountSompi: 1000n, // very small
      scriptPublicKey: "mock"
    }));

    // Add one large UTXO
    mockUtxos.push({
      outpoint: { transactionId: "tx-large", index: 0 },
      address: "kaspa:qrcx...",
      amountSompi: 5000000n,
      scriptPublicKey: "mock"
    });

    const provider: UtxoProvider = {
      getUtxos: async () => mockUtxos
    };

    const service = new TxPlanService(provider, { maxInputsPerTx: 512 });

    const result = await service.planTransaction({
      fromAddress: "kaspa:qrcx...",
      toAddress: "kaspa:qrcx...",
      amountSompi: 1000000n
    });

    // Should only select the single large UTXO
    expect(result.utxoSelection.selectedUtxos).toBe(1);
    expect(result.plan.inputs.length).toBe(1);
    expect(result.plan.inputs[0]?.amountSompi).toBe(5000000n);
  });

  it("should filter out immature coinbase UTXOs", async () => {
    const mockUtxos: Utxo[] = [
      {
        outpoint: { transactionId: "tx-coinbase-immature", index: 0 },
        address: "kaspa:qrcx...",
        amountSompi: 5000000n,
        scriptPublicKey: "mock",
        isCoinbase: true,
        blockDaaScore: 10000n
      },
      {
        outpoint: { transactionId: "tx-coinbase-mature", index: 0 },
        address: "kaspa:qrcx...",
        amountSompi: 5000000n,
        scriptPublicKey: "mock",
        isCoinbase: true,
        blockDaaScore: 5000n
      },
      {
        outpoint: { transactionId: "tx-normal", index: 0 },
        address: "kaspa:qrcx...",
        amountSompi: 5000000n,
        scriptPublicKey: "mock",
        isCoinbase: false,
        blockDaaScore: 10500n
      }
    ];

    const provider: UtxoProvider = {
      getUtxos: async () => mockUtxos,
      getVirtualDaaScore: async () => 10500n // Current DAA score
    };

    const service = new TxPlanService(provider, { coinbaseMaturity: 1000n });

    const result = await service.planTransaction({
      fromAddress: "kaspa:qrcx...",
      toAddress: "kaspa:qrcx...",
      amountSompi: 6000000n
    });

    // tx-coinbase-immature has 500 confirmations (10500 - 10000) -> filtered out
    // tx-coinbase-mature has 5500 confirmations -> kept
    // tx-normal -> kept
    // We need 6M, so both kept UTXOs will be used
    expect(result.utxoSelection.selectedUtxos).toBe(2);
    expect(result.utxoSelection.totalUtxosSeen).toBe(2); // After filter
  });

  it("should throw TOO_MANY_INPUTS_FOR_SINGLE_TX when inputs exceed limit", async () => {
    const mockUtxos: Utxo[] = Array.from({ length: 600 }, (_, i) => ({
      outpoint: { transactionId: `tx-${i}`, index: 0 },
      address: "kaspa:qrcx...",
      amountSompi: 1000n,
      scriptPublicKey: "mock"
    }));

    const provider: UtxoProvider = {
      getUtxos: async () => mockUtxos
    };

    const service = new TxPlanService(provider, {
      maxInputsPerTx: 512,
      marginFeePerInput: 0n
    });

    await expect(
      service.planTransaction({
        fromAddress: "kaspa:qrcx...",
        toAddress: "kaspa:qrcx...",
        amountSompi: 550000n // needs 550 inputs
      })
    ).rejects.toThrow(/TOO_MANY_INPUTS_FOR_SINGLE_TX/);
  });
});
