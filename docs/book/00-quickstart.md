# Chapter 0: 10-Minute Quickstart

If you want to dive straight into code, this is your path. HardKAS allows you to build Kaspa applications completely locally before you ever touch a testnet.

## Prerequisites
- Node.js >= 22.5.0
- pnpm >= 9.0

## The 3 Steps

**1. Scaffold your Project**
```bash
hardkas init kaspa-magic
cd kaspa-magic
pnpm install
```

**2. Explore the Toolkits**
HardKAS groups functionality into **Toolkits**. You don't need to understand complex UTXO mathematics or DAG ordering to start.

- `WalletToolkit`: Manages keys, coin selection, and transaction building.
- `IndexerToolkit`: Reads balances and histories.
- `DAGToolkit`: Analyzes blocks and reachability.

*Note: All amounts in HardKAS (balances, fees, targets) are strictly native `bigint` types.*

**3. Run the Default Scenario**
Your newly initialized project comes with a scenario built in. 
```bash
pnpm start
```
You will instantly see local execution, and a `.hardkas/runs/` directory will generate containing execution evidence.

Welcome to Kaspa development!
