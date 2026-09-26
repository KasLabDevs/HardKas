[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / verifyReplay

# Function: verifyReplay()

> **verifyReplay**(`identity`, `replayCtx`): [`ArtifactStatus`](../type-aliases/ArtifactStatus.md)

Defined in: [packages/core/src/semantics/api.ts:53](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/api.ts#L53)

Verifies the artifact via active replay, isolating it from ambient state.
Invariant: `replay_isolated_from_ambient_runtime_state`

## Parameters

### identity

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

### replayCtx

[`ReplayContext`](../interfaces/ReplayContext.md)

## Returns

[`ArtifactStatus`](../type-aliases/ArtifactStatus.md)
