# 09 - Wallet UTXO Management (Phase 1A)

When building professional Wallets, Treasury management tools, or Merchant services on Kaspa, standard send and receive functions are not enough. High-volume systems require granular **Coin Control** to manage fragmentation and optimize fees.

The `@hardkas/toolkit` includes built-in UTXO analysis and planning through the `wallet.utxos` API.

## Analysis and Diagnostics

Instead of blindly parsing arrays of UTXOs, you can instantly measure the health of a wallet:

```typescript
const wallet = WalletToolkit.open("merchant-vault");

// Quick stats
const stats = await wallet.utxos.statistics();
console.log(`Total UTXOs: ${stats.totalUtxos}, Average Size: ${stats.averageValue} Sompi`);

// Detect dust
const dust = await wallet.utxos.analyzeDust({ thresholdSompi: 10_00000000n });
console.log(`Dust percentage: ${dust.dustPercentage * 100}%`);

// High level analysis and recommendations
const analysis = await wallet.utxos.analyze();
console.log(analysis.recommendedActions); // e.g. ["consolidate"]
```

## Planning Consolidations

If a wallet becomes too fragmented (containing hundreds of small UTXOs), subsequent transactions will incur massive mass penalties, or even fail if they exceed the maximum inputs per transaction.

To solve this, HardKAS provides built-in consolidation planning:

```typescript
const plan = await wallet.utxos.consolidate();

console.log(`Selected inputs: ${plan.inputs.length}`);
console.log(`Estimated fee to consolidate: ${plan.estimatedFee}`);
console.log(`Estimated future fee savings: ${plan.estimatedSavings}`);
```

*Note: In Phase 1A, the `consolidate()` method purely returns a `ConsolidationPlan` for preview and logging purposes. It does not execute the transaction or broadcast it to the network.*

## Granular Transaction Planning (Phase 1B)

Beyond general consolidation, the UTXO Toolkit allows for explicit control over UTXO management without mutating the wallet state. All of these methods return a structured `Plan` (e.g., `SplitPlan`, `MergePlan`, `SweepPlan`) that describes exactly what the transaction will do.

### Splitting UTXOs

To break a large UTXO into smaller chunks (useful for concurrent spending):

```typescript
// Symmetrical split (e.g., divide into 5 equal parts)
const split = await wallet.utxos.splitPlan({
  utxoId: "a1b2c3d4...",
  intoCount: 5
});

// Asymmetrical split (e.g., specific exact outputs, rest goes to change)
const asymSplit = await wallet.utxos.splitPlan({
  utxoId: "a1b2c3d4...",
  outputs: [
    { amountSompi: 10_00000000n }, 
    { amountSompi: 20_00000000n }
  ]
});
```

### Merging Specific UTXOs

If you want to merge specific UTXOs (e.g., all the dust UTXOs you analyzed earlier):

```typescript
const dust = await wallet.utxos.analyzeDust();
const merge = await wallet.utxos.mergePlan({
  utxoIds: dust.dustUtxos.map(u => u.transactionId)
});
```

### Sweeping the Wallet

To transfer the entire balance of the wallet to a destination address:

```typescript
const sweep = await wallet.utxos.sweepPlan({
  destinationAddress: "kaspatest:qz7u9..."
});
```

## The "Plan Only" Philosophy

In HardKAS, the Toolkit describes, plans, and diagnoses. The execution belongs to lower layers. 
Methods like `splitPlan`, `mergePlan`, and `sweepPlan` will never broadcast a transaction or mutate the local database. They return a deterministic plan that you can inspect, serialize, simulate, or ask the user to approve before execution.

## Coin Control Persistence (Phase 1C)

Effective treasury management requires locking specific UTXOs so they aren't accidentally spent by automated planners. HardKAS introduces **Coin Control State**, a local persistence layer stored in `.hardkas/utxo-control.json`.

### Freezing UTXOs

When you freeze a UTXO, it is automatically excluded from **all** diagnostic tools and planners:

```typescript
await wallet.utxos.freeze("a1b2c3d4...", "Reserved for manual spending");

// The frozen UTXO is excluded by default
const stats = await wallet.utxos.statistics();
console.log(stats.availableUtxos); // Excludes frozen
console.log(stats.frozenUtxos);    // 1

// Planners will throw an error if you try to use a frozen UTXO explicitly
// unless you override the safety lock.
```

### Overriding the Lock

If you absolutely must inspect or plan a transaction using frozen UTXOs, use the `includeFrozen: true` override:

```typescript
const fullStats = await wallet.utxos.statistics({ includeFrozen: true });
const split = await wallet.utxos.splitPlan({ 
  utxoId: "a1b2c3d4...", 
  intoCount: 2, 
  includeFrozen: true 
});
```

### Labels and Notes

You can attach metadata to UTXOs for organizational purposes. This metadata is purely local and never enters a transaction unless you explicitly map it to a payload:

```typescript
await wallet.utxos.labels.set("a1b2c3d4...", "DoNotSpend-Dust");
await wallet.utxos.notes.set("a1b2c3d4...", "Waiting for fees to drop");

const label = await wallet.utxos.labels.get("a1b2c3d4...");
```
