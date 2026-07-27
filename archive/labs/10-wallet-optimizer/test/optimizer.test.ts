import { describe, it, expect, beforeAll } from "vitest";
import { WalletToolkit } from "@hardkas/toolkit";
import { createTestHarness, TestHarness } from "@hardkas/testing";

describe("Wallet Optimizer Lab", () => {
  let harness: TestHarness;
  let wallet: WalletToolkit;

  beforeAll(async () => {
    harness = await createTestHarness("simnet");
    
    // We create a fragmented wallet manually to simulate a real-world messy wallet
    wallet = WalletToolkit.open("optimizer-test", { storePath: ".hardkas/optimizer-wallet.json" });
    await wallet.create();

    const address = await wallet.address();

    // Fund the wallet with many small UTXOs (dust and small chunks)
    for (let i = 0; i < 25; i++) {
      harness.send({ from: "alice", to: "optimizer-test", amountSompi: 5_00000000n }); // 5 KAS each
    }
    for (let i = 0; i < 5; i++) {
      harness.send({ from: "alice", to: "optimizer-test", amountSompi: 100_00000000n }); // 100 KAS each
    }

    // Mock the facade's internal query to return these UTXOs
    const mockUtxos = [];
    let idCounter = 1;
    for (let i = 0; i < 25; i++) mockUtxos.push({ transactionId: `tx-${idCounter++}`, amountSompi: 5_00000000n });
    for (let i = 0; i < 5; i++) mockUtxos.push({ transactionId: `tx-${idCounter++}`, amountSompi: 100_00000000n });
    
    (wallet as any).walletQuery.getUtxos = async () => mockUtxos;
  });

  it("should successfully analyze and plan consolidation using the new UTXO Toolkit API", async () => {
    // 1. Get statistics
    const stats = await wallet.utxos.statistics();
    expect(stats.totalUtxos).toBeGreaterThan(0);
    console.log("Wallet Stats:", stats);

    // 2. Analyze dust
    const dust = await wallet.utxos.analyzeDust({ thresholdSompi: 10_00000000n }); // 10 KAS threshold
    expect(dust.dustUtxos.length).toBeGreaterThan(0);
    console.log(`Dust percentage: ${(dust.dustPercentage * 100).toFixed(2)}%`);

    // 3. High-level analysis
    const analysis = await wallet.utxos.analyze();
    console.log("Wallet Analysis:", analysis);
    expect(analysis.recommendedActions).toContain("consolidate");

    // 4. Plan consolidation (NO execution)
    const plan = await wallet.utxos.consolidate();
    console.log("Consolidation Plan:", {
      strategy: plan.strategy,
      inputs: plan.inputs.length,
      estimatedFee: plan.estimatedFee,
      estimatedSavings: plan.estimatedSavings,
      warnings: plan.warnings
    });

    expect(plan.strategy).toBe("consolidation");
    expect(plan.inputs.length).toBeGreaterThan(1);
    expect(plan.inputs.length).toBeLessThanOrEqual(84);

    // 5. Plan a split (Phase 1B)
    const utxos = await wallet.utxos.list();
    const largestUtxo = stats.largest; // 100_00000000n
    const largestUtxoId = utxos.find(u => BigInt(u.amountSompi) === largestUtxo)?.transactionId;
    
    if (largestUtxoId) {
      const symmetricSplit = await wallet.utxos.splitPlan({ utxoId: largestUtxoId, intoCount: 2 });
      expect(symmetricSplit.strategy).toBe("split");
      expect(symmetricSplit.inputs.length).toBe(1);
      expect(symmetricSplit.outputs.length).toBe(2);

      const asymmetricSplit = await wallet.utxos.splitPlan({
        utxoId: largestUtxoId,
        outputs: [{ amountSompi: 10_00000000n }, { amountSompi: 20_00000000n }]
      });
      expect(asymmetricSplit.strategy).toBe("split");
      expect(asymmetricSplit.outputs.length).toBe(3); // 2 requested + 1 change
    }

    // 6. Plan a merge of specific dust UTXOs (Phase 1B)
    const mergePlan = await wallet.utxos.mergePlan({
      utxoIds: dust.dustUtxos.map(u => u.transactionId).slice(0, 5) // Pick 5 dust UTXOs
    });
    expect(mergePlan.strategy).toBe("merge");
    expect(mergePlan.inputs.length).toBe(5);
    expect(mergePlan.outputs.length).toBe(1);

    // 7. Plan a full wallet sweep (Phase 1B)
    const sweepPlan = await wallet.utxos.sweepPlan({ destinationAddress: "kaspatest:qzz..." });
    expect(sweepPlan.strategy).toBe("sweep");
    expect(sweepPlan.inputs.length).toBe(stats.totalUtxos);
    expect(sweepPlan.outputs[0].address).toBe("kaspatest:qzz...");

    // 8. Test Coin Control (Phase 1C)
    // Freeze a specific dust UTXO and ensure it is excluded from plans
    const dustUtxoToFreeze = dust.dustUtxos[0].transactionId;
    
    // Label it and add a note
    await wallet.utxos.labels.set(dustUtxoToFreeze, "DoNotSpend-Dust");
    await wallet.utxos.notes.set(dustUtxoToFreeze, "Waiting for fees to drop");
    
    // Freeze it
    await wallet.utxos.freeze(dustUtxoToFreeze, "Save for later");
    
    // Verify it is excluded from stats by default
    const newStats = await wallet.utxos.statistics();
    expect(newStats.availableUtxos).toBe(stats.totalUtxos - 1);
    expect(newStats.frozenUtxos).toBe(1);
    
    // Verify it is excluded from consolidation plans
    const newConsolidation = await wallet.utxos.consolidate();
    expect(newConsolidation.inputs.find(u => u.transactionId === dustUtxoToFreeze)).toBeUndefined();
    
    // Verify includeFrozen override works
    const statsWithFrozen = await wallet.utxos.statistics({ includeFrozen: true });
    expect(statsWithFrozen.totalUtxos).toBe(stats.totalUtxos);
    expect(statsWithFrozen.includeFrozen).toBe(true);

    // Ensure splitPlan fails on frozen UTXO without override
    await expect(wallet.utxos.splitPlan({ utxoId: dustUtxoToFreeze, intoCount: 2 })).rejects.toThrow(/is frozen/);
    
    // Verify state persistence
    const controlState = await wallet.utxos.controlState();
    expect(controlState.frozen[dustUtxoToFreeze]).toBeDefined();
    expect(controlState.labels[dustUtxoToFreeze]).toBe("DoNotSpend-Dust");

    // Unfreeze and verify it is available again
    await wallet.utxos.unfreeze(dustUtxoToFreeze);
    const finalStats = await wallet.utxos.statistics();
    expect(finalStats.availableUtxos).toBe(stats.totalUtxos);
  });
});
