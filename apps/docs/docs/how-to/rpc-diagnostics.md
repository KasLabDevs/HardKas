---
title: RPC diagnostics
---

HardKAS includes L1 and L2 RPC diagnostics so tools and agents can inspect runtime readiness instead of guessing.

`hardkas rpc health`Check Kaspa RPC availability.

`hardkas rpc info`Show RPC connection information.

`hardkas rpc doctor --endpoints a,b`Run endpoint diagnostics.

`hardkas rpc dag`Show DAG information from node.

`hardkas rpc mempool [txId]`Inspect mempool status.

`hardkas rpc utxos <address>`Query UTXOs for an address.

`hardkas l2 rpc health --network igra --json`Check Igra RPC health.

`hardkas l2 profile validate igra --json`Validate L2 profile configuration.
