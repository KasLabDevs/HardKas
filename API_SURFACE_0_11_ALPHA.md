# API Surface: 0.11-alpha

## Monorepo Inventory
The HardKAS 0.11-alpha monorepo encapsulates 36 active workspace packages (excluding exploratory experimental labs).

### Core Libraries
- `@hardkas/core`
- `@hardkas/sdk`
- `@hardkas/client`
- `@hardkas/config`

### Execution & Node Tooling
- `@hardkas/kaspa-rpc`
- `@hardkas/localnet`
- `@hardkas/simulator`
- `@hardkas/node-runner`
- `@hardkas/node-orchestrator`
- `@hardkas/simulator-adapters`

### Domain Toolkits
- `@hardkas/toolkit` (Primary developer surface)
- `@hardkas/tx-builder`
- `@hardkas/accounts`
- `@hardkas/artifacts`
- `@hardkas/jobs`
- `@hardkas/query`
- `@hardkas/query-store`

### L2 & Interop
- `@hardkas/l2`
- `@hardkas/bridge-local`
- `@hardkas/react`
- `@hardkas/wallet-adapter`

### Tooling & CLI
- `@hardkas/cli`
- `@hardkas/testing`
- `@hardkas/dev-server`
- `@hardkas/sessions`

### Plugins
- `@hardkas/plugin-rpc-backend`
- `@hardkas/plugin-local-indexer`

## Public Toolkit Surface
The primary interaction model is `Toolkits`. Toolkits provide asynchronous boundaries to Kaspa constructs.

### Data Types (Standardized in P53.1)
- **Financial Amounts**: `bigint` (e.g. balances, `amountSompi`, `feeSompi`, `dustThresholdSompi`)
- **Consensus Scores**: `bigint` (e.g. `blueScore`)
- **Timestamps / Counters**: `number` (e.g. indices, unix timestamps)

_Note: The framework enforce `bigint` on all SDK/Toolkit methods to avoid float precision issues when interacting with Sompi natively._

### 1. WalletToolkit
```ts
const wallet = await WalletToolkit.open({ ... });
await wallet.connect();
await wallet.balance(address);
await wallet.utxos(address);
await wallet.history(address);
await wallet.transfer(tx);
```

### 2. DAGToolkit
```ts
const dag = await DAGToolkit.open({ ... });
await dag.connect();
await dag.ingestBlocks(blocks);
await dag.blueScore();
await dag.statistics();
```

### 3. IndexerToolkit
```ts
const indexer = await IndexerToolkit.open({ backend: kaspaRpcBackendPlugin({...}) });
await indexer.connect();
await indexer.balance(address);
```

### 4. SilverToolkit (Phase 1A)
```ts
const silver = await SilverToolkit.open();
const tpl = await silver.template("P2SH");
const build = await silver.build(source);
const sim = await silver.simulate(build);
```

### 5. SnapshotToolkit
```ts
const snapshotStore = await SnapshotToolkit.open();
await snapshotStore.create("checkpoint-A");
await snapshotStore.restore("checkpoint-A");
```
