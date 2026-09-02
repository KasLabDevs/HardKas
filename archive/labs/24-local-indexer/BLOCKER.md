# BLOCKER: Local Indexer Primitives Missing

**Context:** Phase 8 Local Indexer Lab `archive/labs/24-local-indexer`
**Objective:** Build an address-scoped persistent local indexer using current RC16 APIs.
**Execution Status:** STOPPED.

## Discovered Frictions & Blockers

### 1. Missing `NotifyVirtualChainChanged` (CRITICAL)
- **Problem**: Reorgs and virtual chain updates cannot be tracked efficiently.
- **Detail**: The HardKAS RPC bindings (`packages/kaspa-rpc`) and the Events engine (`packages/rpc-events`) **do not expose** `NotifyVirtualChainChanged` or `VirtualChainChangedNotificationMessage`.
- **Impact**: When a reorg occurs, we receive `utxosChanged` (or we don't know it's a reorg vs standard inclusion) but we have no way of knowing what blocks were removed from the virtual chain to rollback our projection. Attempting to use `BlockAdded` is incorrect because added blocks are not necessarily in the virtual chain yet.
- **Minimum Primitive Required**: Expose `NotifyVirtualChainChanged` (including added/removed chain blocks and accepted transaction IDs) in `packages/kaspa-rpc` and map it in `packages/rpc-events`.

### 2. Missing Durable Idempotency Identity / Cursor Semantics
- **Problem**: Duplicate notifications cannot be safely ignored because there is no durable semantic identity.
- **Detail**: The SDK `sdk.events` "unwraps" the `EventEnvelope.id`, but even if it were exposed, a transport-level `Envelope.id` is not guaranteed to be stable across reconnects. If the node re-delivers the same network fact upon resubscription, it will likely have a new envelope ID. 
- **Minimum Primitive Required**: A durable semantic identity (e.g. cursor + hashes added/removed + accepted tx identity) derived from Kaspa's authoritative evidence, not just an arbitrary transport ID. (NOTE: Deferred to later discovery).

### 3. Atomic Bootstrap Cursor Ambiguity
- **Problem**: Establishing `C0` (initial state) relative to live events is subject to race conditions.
- **Detail**: `getUtxosByAddresses` returns the UTXO set without atomicity guarantees regarding the `VirtualDaaScore` or `BlockHash` at which the snapshot was taken. 
- **Minimum Primitive Required**: An architectural pattern (e.g. Subscribe -> Establish Cursor -> Fetch Snapshot -> Reconcile) or a new primitive. We must first implement VirtualChainChanged to verify if this race condition can be solved architecturally before requesting a fictitious `getUtxosAtVirtualDaaScore` RPC. (NOTE: Deferred to later discovery).

## Conclusion
The lab cannot proceed strictly adhering to "reconstruct projection without accessing internals" because the fundamental primitive for virtual chain tracking is missing. 

Waiting for architectural approval to design and implement these missing SDK primitives before continuing the lab.
