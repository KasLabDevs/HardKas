[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / detectSemanticDrift

# Function: detectSemanticDrift()

> **detectSemanticDrift**(`dashboardView`, `queryStoreView`, `replayView`, `filesystemView`): [`SemanticDriftReport`](../interfaces/SemanticDriftReport.md)

Defined in: [packages/core/src/semantics/drift.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/drift.ts#L16)

Compares the truth across different subsystems.
If multiple subsystems disagree about truth, that is a CRITICAL semantic failure.
Invariant: `subsystems_cannot_disagree_about_canonical_truth`

## Parameters

### dashboardView

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

### queryStoreView

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

### replayView

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

### filesystemView

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

## Returns

[`SemanticDriftReport`](../interfaces/SemanticDriftReport.md)
