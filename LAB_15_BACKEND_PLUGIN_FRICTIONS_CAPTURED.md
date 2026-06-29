# LAB_15_BACKEND_PLUGIN_FRICTIONS_CAPTURED

Lab 15 successfully prototyped injecting a backend plugin into `IndexerToolkit`. 

## Frictions Discovered
1. **API Signature**: `IndexerToolkit.open` lacks configuration options for plugins (e.g., `backend` or `plugin` properties).
2. **Synchronous Boot vs Async RPC**: `IndexerToolkit.open` is synchronous. Real Kaspa RPC needs async initialization (`await connect()`). Toolkits must handle async plugin boot sequences.
3. **Hardcoded Local Stores**: The toolkit unconditionally instantiates local JSON projection stores on boot. A plugin system must allow overriding or skipping local store creation if the backend provides those capabilities.
4. **Internal Routing / Delegation**: Methods like `indexer.balance()` read straight from local projections. Toolkits need an internal routing layer to delegate requests to the registered plugin if one exists.
5. **Snapshot Incompatibilities**: `IndexerToolkit` implements `SnapshotParticipant`. External backends (like a real kaspad node) cannot be snapshot locally in the same way. The plugin system must govern snapshot capabilities per backend.

These frictions form the basis of the `P50_RUNTIME_BACKEND_PLUGINS_PLAN.md`.
