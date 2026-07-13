import { describe, it, expect } from "vitest";
import { selectCoins, CoinSelectionRequest } from "../src/coin-selector.js";
import { Utxo, createMockUtxo } from "../src/index.js";

describe("CoinSelector", () => {
  const dummyUtxos: Utxo[] = [
    createMockUtxo({ address: "kaspatest:1", amountSompi: 2000n, index: 0 }),
    createMockUtxo({ address: "kaspatest:2", amountSompi: 3000n, index: 1 }),
    createMockUtxo({ address: "kaspatest:3", amountSompi: 5000n, index: 2 }),
    createMockUtxo({ address: "kaspatest:4", amountSompi: 50n, index: 3 }) // Dust
  ];

  it("exact match (if fees were zero, but fees exist, so needs more)", () => {
    // To get an exact match we need the UTXO to perfectly cover target + fee
    const utxos = [createMockUtxo({ address: "kaspatest:ex", amountSompi: 1660n, index: 0 })];
    // If target is 1000 and fee is 660
    const request: CoinSelectionRequest = {
      utxos,
      targetSompi: 1000n,
      feeRateSompiPerMass: 1n, // small fee
      strategy: "largest-first",
      changeAddress: "kaspatest:change",
      dustThresholdSompi: 100n
    };
    
    // mass for 1 input + 1 output (no change) = 100 (base) + 160 (in) + 400 (out) = 660
    // base fee is 660. Conservative fee = (660 * 110 + 99)/100 = 726
    // If we want exact match with fee 726 and target 1000, we need exactly 1726n.
    const utxoExact = [createMockUtxo({ address: "kaspatest:ex", amountSompi: 1726n, index: 0 })];
    const requestExact: CoinSelectionRequest = { ...request, utxos: utxoExact };

    const result = selectCoins(requestExact);
    expect(result.selectedUtxos.length).toBe(1);
    expect(result.changeSompi).toBe(0n); // Exact match
    expect(result.estimatedFeeSompi).toBe(726n);
    expect(result.outputs.length).toBe(1); // No change output
  });

  it("needs change", () => {
    const request: CoinSelectionRequest = {
      utxos: dummyUtxos,
      targetSompi: 1000n,
      feeRateSompiPerMass: 1n,
      strategy: "largest-first",
      changeAddress: "kaspatest:change",
      dustThresholdSompi: 100n
    };

    const result = selectCoins(request);
    expect(result.selectedUtxos.length).toBe(1);
    // Largest is 5000n. 
    expect(result.selectedUtxos[0]!.amountSompi).toBe(5000n);
    expect(result.changeSompi).toBeGreaterThan(0n);
    expect(result.outputs.length).toBe(2); // main + change
    expect(result.outputs[1]!.address).toBe("kaspatest:change");
  });

  it("insufficient funds", () => {
    const request: CoinSelectionRequest = {
      utxos: dummyUtxos,
      targetSompi: 10000n,
      feeRateSompiPerMass: 1n,
      strategy: "largest-first",
      changeAddress: "kaspatest:change",
      dustThresholdSompi: 100n
    };

    expect(() => selectCoins(request)).toThrow(/Insufficient funds/);
  });

  it("dust UTXOs ignored", () => {
    const request: CoinSelectionRequest = {
      utxos: dummyUtxos,
      targetSompi: 7000n, // requires 5000 + 2000
      feeRateSompiPerMass: 1n,
      strategy: "smallest-first",
      changeAddress: "kaspatest:change",
      dustThresholdSompi: 100n
    };

    const result = selectCoins(request);
    // Should use 2000, 3000, 5000. It should ignore 50n (dust)
    const selectedAmounts = result.selectedUtxos.map(u => u.amountSompi);
    expect(selectedAmounts).not.toContain(50n);
    expect(result.dustRejected.length).toBe(1);
    expect(result.dustRejected[0]!.amountSompi).toBe(50n);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("many small UTXOs", () => {
    const manyUtxos: Utxo[] = [];
    for(let i=0; i<100; i++) {
        manyUtxos.push(createMockUtxo({ address: `kaspatest:${i}`, amountSompi: 500n, index: i }));
    }
    const request: CoinSelectionRequest = {
        utxos: manyUtxos,
        targetSompi: 20000n, // Needs 40 UTXOs + fees
        feeRateSompiPerMass: 1n,
        strategy: "smallest-first",
        changeAddress: "kaspatest:change",
        dustThresholdSompi: 100n
    };

    const result = selectCoins(request);
    expect(result.selectedUtxos.length).toBeGreaterThanOrEqual(40);
    expect(result.totalInputSompi).toBeGreaterThanOrEqual(20000n + result.estimatedFeeSompi);
  });

  it("deterministic output", () => {
    // Two UTXOs with exact same amount. Order in array should not matter for tie-breaking.
    const utxoA = createMockUtxo({ address: "kaspatest:A", amountSompi: 1000n, index: 1 }); // txId mock-kaspatest:A-1
    const utxoB = createMockUtxo({ address: "kaspatest:B", amountSompi: 1000n, index: 0 }); // txId mock-kaspatest:B-0

    // B has lower txId than A because 'mock-kaspatest:A-1' vs 'mock-kaspatest:B-0'. 
    // Wait, 'A' comes before 'B' in string comparison. So A has lower txId.
    const request1: CoinSelectionRequest = {
        utxos: [utxoB, utxoA],
        targetSompi: 500n,
        feeRateSompiPerMass: 1n,
        strategy: "largest-first"
    };

    const request2: CoinSelectionRequest = {
        utxos: [utxoA, utxoB],
        targetSompi: 500n,
        feeRateSompiPerMass: 1n,
        strategy: "largest-first"
    };

    const result1 = selectCoins(request1);
    const result2 = selectCoins(request2);

    expect(result1.selectedUtxos[0]!.outpoint.transactionId).toBe(result2.selectedUtxos[0]!.outpoint.transactionId);
  });

  it("invalid amount blocked (negative, float, NaN, Infinity)", () => {
      const baseReq = {
        utxos: dummyUtxos,
        feeRateSompiPerMass: 1n,
        strategy: "largest-first" as const
      };

      expect(() => selectCoins({ coinbaseMaturity: 100n, ...baseReq, targetSompi: -100n })).toThrow(/COIN_SELECTION_INVALID_AMOUNT/);
      expect(() => selectCoins({ coinbaseMaturity: 100n, ...baseReq, targetSompi: 1.5 as any })).toThrow(/COIN_SELECTION_INVALID_AMOUNT/);
      expect(() => selectCoins({ coinbaseMaturity: 100n, ...baseReq, targetSompi: NaN as any })).toThrow(/COIN_SELECTION_INVALID_AMOUNT/);
      expect(() => selectCoins({ coinbaseMaturity: 100n, ...baseReq, targetSompi: Infinity as any })).toThrow(/COIN_SELECTION_INVALID_AMOUNT/);
      expect(() => selectCoins({ coinbaseMaturity: 100n, ...baseReq, targetSompi: "1.123" as any })).toThrow(/COIN_SELECTION_INVALID_AMOUNT/);
      expect(() => selectCoins({ coinbaseMaturity: 100n, ...baseReq, targetSompi: "abc" as any })).toThrow(/COIN_SELECTION_INVALID_AMOUNT/);
  });
});
