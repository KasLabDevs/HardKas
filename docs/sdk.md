# SDK Reference

The `@hardkas/sdk` provides programmatic access to the HardKAS runtime, enabling you to build deterministic workflows, query artifacts, and manage transactions.

## Initialization

Always instantiate the SDK using the factory method. Do not use the `new` keyword.

```typescript
import { Hardkas } from '@hardkas/sdk';

// Initializes the workspace based on process.cwd()
const sdk = await Hardkas.create({
  autoBootstrap: true, // Creates .hardkas/ if it doesn't exist
  mode: 'simulated'    // Default for local development
});
```

## `sdk.tx` - Transaction Lifecycle

Transactions are split into explicit artifact-generating steps.

### `tx.plan(options)`
Generates an `UnsignedTxArtifact`. It dynamically resolves the `mode` ('real' or 'simulated') based on the network target.

### `tx.sign(planArtifact, credentials)`
Deterministically signs a plan, producing a `SignedTxArtifact`. For multisig, signatures are sorted strictly using byte-value comparison to ensure cross-platform hash identicality.

### `tx.broadcast(signedArtifact)`
Submits the transaction to the network and generates a `BroadcastReceiptArtifact`.

## `sdk.artifacts` - Artifacts Manager

Read and inspect artifacts. 

> [!WARNING]  
> Path Traversal Protection: `sdk.artifacts.read(path)` will throw an error if the resolved absolute path points outside of the workspace boundary.

## `sdk.query` - Query Store

Access the eventually-consistent SQLite projection of your workspace.

```typescript
const plans = await sdk.query.findArtifacts({ type: 'tx-plan' });
```

## `sdk.replay` - Replay Engine

Cryptographically verify the causality of artifacts.

```typescript
await sdk.replay.verify();
```
*Note: Canonical directories (`receipts`, `traces`, `deployments`) are resolved strictly from the workspace root (`.hardkas/`), never nested inside `.hardkas/artifacts/`.*
