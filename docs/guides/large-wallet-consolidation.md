# Large Wallet Consolidation

If your node has mined thousands of blocks, your wallet contains thousands of dust UTXOs.

## 1. Dry Run
Detect how many transactions are needed:
```bash
hardkas accounts consolidate --dry-run
```

## 2. Execution
Execute the batch consolidation. This will create multiple chained transactions.
```bash
hardkas accounts consolidate --execute --yes
```
*Note: This process may take several minutes as it waits for node confirmations between chained sweeps.*
