[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ArtifactStatus

# Type Alias: ArtifactStatus

> **ArtifactStatus** = `"UNKNOWN"` \| `"PROJECTED"` \| `"STALE"` \| `"VERIFIED"` \| `"REPLAY_VERIFIED"` \| `"CORRUPTED"` \| `"QUARANTINED"`

Defined in: [packages/core/src/semantics/types.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/types.ts#L12)

Formal Artifact Status Lattice

UNKNOWN: Unreadable, ambiguous, partially classified, migration-pending states.
PROJECTED: An artifact read from disk / state whose truth has not yet been verified.
STALE: An artifact whose dependencies/lineage has drifted since it was verified.
VERIFIED: Integrity, signature, and internal capability constraints are verified.
REPLAY_VERIFIED: Full lineage and determinism verified via an active replay.
CORRUPTED: Irreparable semantic or cryptographic corruption detected.
QUARANTINED: Corrupted or malicious artifact safely isolated from runtime.
