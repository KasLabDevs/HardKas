# Lab 15 Frictions Resolved

The prototype correctly utilizes the official `@hardkas/plugin-rpc-backend` without `any` casts.
The `KaspaJsonRpcClient` is properly queried for `getBalanceByAddress` and `getUtxosByAddress` in a safe way without using private methods or relying on non-existent connection methods.
