# Archived Code

This directory contains components that were frozen during the `0.11.4` hygiene audit. These files are moved out of the `packages/` workspace to ensure they are completely excluded from builds, Knip, and NPM publishing, while still being available for reference or resurrection.

## Inventory

| Source Package | File / Component | Archived At Version | Reason | Replacement |
| -------------- | ---------------- | ------------------- | ------ | ----------- |
| `@hardkas/cli` | `example-list-runner.ts` | `0.11.4-alpha` | Unused CLI runner (Historical / Dead code) | N/A |
| `@hardkas/cli` | `example-run-runner.ts` | `0.11.4-alpha` | Unused CLI runner (Historical / Dead code) | N/A |
| `@hardkas/cli` | `snapshot-restore-runner.ts` | `0.11.4-alpha` | Unused CLI runner (Historical / Dead code) | N/A |
| `@hardkas/cli` | `trace-runner.ts` | `0.11.4-alpha` | Unused CLI runner (Historical / Dead code) | N/A |
| `@hardkas/cli` | `tx-receipts-runner.ts` | `0.11.4-alpha` | Unused CLI runner (Historical / Dead code) | N/A |
| `@hardkas/kaspa-rpc` | `rpcBlockToDagBlock.ts` | `0.11.4-alpha` | Legacy RPC adapter | Needs review for canonical serializers / indexer needs |
| `@hardkas/kaspa-rpc` | `rpcUtxoToWalletUtxo.ts` | `0.11.4-alpha` | Legacy RPC adapter | Needs review for canonical serializers / indexer needs |
