# Large Wallet Consolidation

If your node has mined thousands of blocks to an account, that account holds thousands of small coinbase UTXOs.
`accounts consolidate` merges them, smallest first; immature coinbase outputs are skipped.

## 1. Dry Run
Detect how many transactions are needed (the account is required; without `--execute` the command only estimates):
```bash
hardkas accounts consolidate <account> --network simnet --dry-run
```

## 2. Execution
Execute the batch consolidation. This will create multiple chained transactions.
```bash
hardkas accounts consolidate <account> --network simnet --execute --yes
```
For an encrypted account, add `--password-env <VAR>` (the variable that holds its keystore password) or
`--password-stdin`. Mainnet is refused.

*Note: This process may take several minutes as it waits for node confirmations between chained sweeps.*
