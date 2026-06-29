import { WalletToolkit } from '@hardkas/toolkit';

async function main() {
  const wallet = WalletToolkit.open('alice');

  // 1. Basic properties
  const address = await wallet.address();
  const balance = await wallet.balance();
  console.log(`Address: ${address}, Balance: ${balance} Sompi`);

  // 2. Fetch raw UTXOs
  const utxos = await wallet.utxos.list();
  console.log(`Loaded ${utxos.length} UTXOs`);

  // 3. Get fast statistics (without processing dust thresholds)
  const stats = await wallet.utxos.statistics();
  console.log(`Wallet UTXO stats:`, stats);
  // Example output: { totalUtxos: 30, totalValue: 62500000000n, averageValue: 2083333333n, largest: 10000000000n, smallest: 500000000n }

  // 4. Analyze dust and fragmentation
  // You can override the default threshold (10 KAS)
  const dust = await wallet.utxos.analyzeDust({ thresholdSompi: 10_00000000n });
  console.log(`Dust percentage: ${(dust.dustPercentage * 100).toFixed(2)}%`);

  // 5. High-level wallet analysis with recommendations
  const analysis = await wallet.utxos.analyze();
  console.log(`Fragmentation score: ${analysis.fragmentationScore}`);
  console.log(`Recommended actions:`, analysis.recommendedActions);

  // 6. Plan a consolidation if recommended
  if (analysis.recommendedActions.includes("consolidate")) {
    const plan = await wallet.utxos.consolidate();
    console.log(`Proposed consolidation plan will select ${plan.inputs.length} inputs.`);
    console.log(`Estimated fee: ${plan.estimatedFee} Sompi.`);
    console.log(`Future estimated savings: ${plan.estimatedSavings} Sompi.`);
    
    if (plan.warnings.length > 0) {
      console.log(`Warnings before executing:`, plan.warnings);
    }
  }

  // 7. Plan a split (Phase 1B)
  // Split a UTXO symmetrically into 2 parts
  const utxoToSplit = utxos[0].transactionId;
  const splitPlan = await wallet.utxos.splitPlan({ 
    utxoId: utxoToSplit, 
    intoCount: 2 
  });
  console.log(`Split plan outputs: ${splitPlan.outputs.length}`);

  // Or asymmetrically
  const asymSplit = await wallet.utxos.splitPlan({
    utxoId: utxoToSplit,
    outputs: [{ amountSompi: 10_00000000n }, { amountSompi: 20_00000000n }]
  });

  // 8. Plan a merge of specific UTXOs (e.g. dust)
  const dustUtxos = (await wallet.utxos.analyzeDust()).dustUtxos;
  if (dustUtxos.length >= 2) {
    const mergePlan = await wallet.utxos.mergePlan({
      utxoIds: dustUtxos.map(u => u.transactionId)
    });
    console.log(`Merge plan reduces ${mergePlan.inputs.length} inputs to ${mergePlan.outputs.length} output.`);
  }

  // 9. Plan a full sweep of the wallet
  const sweepPlan = await wallet.utxos.sweepPlan({
    destinationAddress: "kaspatest:qz7u9..."
  });
  console.log(`Sweep plan transfers all funds (${sweepPlan.inputs.length} inputs). Fee: ${sweepPlan.estimatedFee} Sompi.`);

  // 10. Coin Control State (Phase 1C)
  const someUtxo = utxos[1].transactionId;
  
  // Set a label and a note
  await wallet.utxos.labels.set(someUtxo, "Treasury");
  await wallet.utxos.notes.set(someUtxo, "Locked until Q4");

  // Freeze the UTXO (this will exclude it from any automated plans and statistics)
  await wallet.utxos.freeze(someUtxo, "Holding");

  // Fetch statistics to see it's now excluded from 'availableUtxos'
  const newStats = await wallet.utxos.statistics();
  console.log(`Available UTXOs: ${newStats.availableUtxos} | Frozen UTXOs: ${newStats.frozenUtxos}`);

  // You can override this exclusion explicitly if you know what you're doing
  const fullStats = await wallet.utxos.statistics({ includeFrozen: true });
  console.log(`Total UTXOs (override): ${fullStats.totalUtxos}`);

  // Note: All operations above return planners and do not mutate network state.
  // The control state (freeze, labels, notes) is persisted locally in `.hardkas/utxo-control.json`.
}

main().catch(console.error);
