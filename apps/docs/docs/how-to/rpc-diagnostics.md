---
title: RPC diagnostics
---

HardKAS includes L1 RPC diagnostics so tools and agents can inspect runtime readiness instead of guessing.

`hardkas rpc health`Check Kaspa RPC availability.

`hardkas rpc info`Show RPC connection information.

`hardkas rpc doctor --endpoints a,b`Run endpoint diagnostics.

`hardkas rpc dag`Show DAG information from node.

`hardkas rpc mempool [txId]`Inspect mempool status.

`hardkas rpc utxos <address>`Query UTXOs for an address.

The Igra L2 checks are a Lab, not part of the L1 CLI (it registers no `l2` command group); `hardkas dev doctor` and `hardkas local wizard` check an Igra JSON-RPC endpoint.
