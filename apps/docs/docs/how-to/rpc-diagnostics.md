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

The Igra L2 checks are a Lab, not part of the L1 CLI: they come with the `l2` extension (`hardkas extension install l2`), whose `hardkas l2 doctor` and `hardkas l2 wizard` check an Igra JSON-RPC endpoint (`local wizard` is the alias of `l2 wizard` for one version; `dev doctor`, also kept for one version, is `hardkas doctor workspace` plus `hardkas l2 doctor`).
