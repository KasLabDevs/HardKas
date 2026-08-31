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

### 2. Envelope Identity Missing for Idempotency
- **Problem**: Duplicate notifications cannot be safely ignored.
- **Detail**: The SDK `sdk.events.subscribe("utxosChanged")` provides the unwrapped `UtxoChangedEvent` payload. It hides the `EventEnvelope.id`, which is the idempotency key required for the `processed_events` table.
- **Minimum Primitive Required**: Expose the `metadata` or `EventEnvelope` ID to consumers of `sdk.events` so they can implement "exactly-once" processing on top of "at-least-once" delivery.

### 3. Cursor Bootstrap Ambiguity
- **Problem**: Setting the initial checkpoint `C0` is ambiguous.
- **Detail**: `getUtxosByAddresses` returns the UTXO set, but doesn't return the precise `VirtualDaaScore` or `BlockHash` at which this snapshot was taken. This makes resuming from `C0` subject to race conditions if events arrive during the initial bootstrap.
- **Minimum Primitive Required**: A way to get the current Virtual Chain state atomically, or tie the `getUtxosByAddresses` response to a DAA score.

## Conclusion
The lab cannot proceed strictly adhering to "reconstruct projection without accessing internals" because the fundamental primitive for virtual chain tracking is missing. 

Waiting for architectural approval to design and implement these missing SDK primitives before continuing the lab.
