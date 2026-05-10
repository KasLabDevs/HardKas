# Cookbook: Replay Debugging

One of the most powerful features of HardKAS is the ability to debug a failed transaction by replaying its artifact in a local, controlled environment.

## The Scenario

You sent a transaction to `testnet-10` and it failed with a vague RPC error. Or worse, it was accepted by the mempool but never included in a block.

## The Debugging Workflow

### 1. Export the Artifact
Locate the `.plan.json` or `.signed.json` artifact for the failed transaction.

```bash
# Verify it locally first to check for simple corruption
hardkas artifact verify path/to/failed.plan.json --strict
```

### 2. Enter Simulation Mode
Switch your HardKAS environment to `simulated` mode to isolate the transaction logic from the real network.

```typescript
// In your test script or scratch file
const sdk = await Hardkas.create({ defaultNetwork: 'simulated' });
```

### 3. Replay the Intent
Use the `sdk.tx.replay` command (or the CLI) to execute the exact same plan against the current simulator state.

```bash
# Via CLI
hardkas replay verify path/to/failed.plan.json
```

### 4. Analyze the Failure
HardKAS will report exactly which invariant was violated:
- **[MASS_MISMATCH]**: The real mass calculated by the node differs from your estimation.
- **[INSUFFICIENT_FEE]**: The fee provided is lower than the required minimum for the calculated mass.
- **[DUST_OUTPUT]**: One of the outputs is too small for the network to accept.
- **[STALE_UTXO]**: One of the UTXOs in the plan was already spent.

### 5. Fix and Re-Plan
Once the issue is identified (e.g., fee rate too low), you can adjust your planning parameters and generate a *new* artifact.

```typescript
const newPlan = await sdk.tx.plan({
  from: 'alice',
  to: 'bob',
  amount: '10',
  feeRate: 2n // Increased fee rate
});
```

## Why this works
Because HardKAS artifacts are **deterministic**, the simulation environment will behave exactly like the real network for the purposes of semantic validation. This allows you to iterate rapidly without spending real KAS or waiting for BlockDAG confirmations.
