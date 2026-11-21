[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / LockTimeRequest

# Type Alias: LockTimeRequest

> **LockTimeRequest** = \{ `daaScore`: `bigint` \| `number` \| `string`; \} \| \{ `timestampMs`: `bigint` \| `number` \| `string`; \}

Defined in: [packages/tx-builder/src/lock-time.ts:26](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L26)

What a caller asks for: a DAA score or a time in milliseconds (bigint, a safe integer or a decimal string).
