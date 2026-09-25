[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / EventKind

# Type Alias: EventKind

> **EventKind** = `"workflow.plan.created"` \| `"workflow.signed"` \| `"workflow.submitted"` \| `"workflow.receipt"` \| `"workflow.started"` \| `"workflow.completed"` \| `"workflow.failed"` \| `"integrity.hash_mismatch"` \| `"integrity.schema_violation"` \| `"integrity.lineage_break"` \| `"integrity.violation"` \| `"dag.conflict"` \| `"dag.displacement"` \| `"dag.sink_moved"` \| `"rpc.health"` \| `"rpc.error"` \| `"rpc.stale"` \| `"replay.divergence"` \| `"replay.verified"` \| `"localnet.started"` \| `"localnet.stopped"` \| `"l2.deposit.planned"` \| `"l2.withdrawal.planned"` \| `"artifact.written"` \| `"artifact.indexed"` \| `"artifact.corrupted"` \| `"sqlite.commit"` \| `"replay.invalidated"` \| `"replay.completed"` \| `"replay.excluded"` \| `"sse.emitted"` \| `"dashboard.cache_invalidated"` \| `"dashboard.refetch_started"` \| `"dashboard.refetch_completed"` \| `"query_store.sync_started"` \| `"query_store.sync_completed"` \| `"lineage.verification_failed"`

Defined in: [packages/core/src/events.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L33)

HardKAS Core Event Kinds.
