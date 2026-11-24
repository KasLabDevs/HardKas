[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / LockTimeFinality

# Type Alias: LockTimeFinality

> **LockTimeFinality** = \{ `final`: `true`; `lockTime`: `bigint`; `reason`: `"no-lock"` \| `"reached"` \| `"all-inputs-final"`; `reference?`: `bigint`; \} \| \{ `final`: `false`; `kind`: [`LockTimeKind`](LockTimeKind.md); `lockTime`: `bigint`; `reference`: `bigint`; \} \| \{ `final`: `"unknown"`; `kind`: [`LockTimeKind`](LockTimeKind.md); `lockTime`: `bigint`; `missing`: `"virtualDaaScore"` \| `"pastMedianTimeMs"`; \}

Defined in: [packages/tx-builder/src/lock-time.ts:165](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L165)
