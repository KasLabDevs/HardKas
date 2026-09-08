# Chapter 12: Known Limitations (0.11-alpha)

While HardKAS is immensely powerful for deterministic simulation and validation, there are several explicit boundaries you must be aware of when using `0.11-alpha`.

## 1. Simulation Only: Silver Toolkit
The `SilverToolkit` (our Kaspa script compiler) is strictly `simulation-only` right now. You can build templates, compile scripts, and simulate their execution within HardKAS perfectly, but you cannot broadcast these custom scripts directly to the Kaspa mainnet via the toolkit yet.

## 2. No L2 Production Tooling
HardKAS provides the foundational local-first testing grounds for L2 paradigms (such as state channels or off-chain state commitments). However, we do not yet offer "deploy to production" tooling for L2 sequencers or indexers.

## 3. Mainnet Broadcast Guarantees
We validate deterministically. If a transaction passes the HardKAS simulation, it is cryptographically valid. However, we provide **no mainnet propagation guarantees**. Under heavy mempool load, real-world nodes may reject valid transactions due to local node policies. Always test against Docker `simnet` first.

## 4. Snapshot Tooling vs Real Nodes
The `SnapshotToolkit` is a phenomenal tool for branching local state, testing different outcomes, and merging results. 
However, when you use a real remote backend (like the RPC Plugin), snapshots **only capture metadata/stubs**. They do *not* magically snapshot the 50GB DAG state of the remote Rusty Kaspa node. Time-travel debugging is limited to the local simulation boundary.

## 5. RPC Backend Plugin (V1)
The `@hardkas/plugin-rpc-backend` is a V1 implementation. It reliably routes queries (`balance()`, `history()`, `utxos()`), but it does not yet have resilient connection pooling or retry jitter. If the node disconnects, you must restart your agent or script.
