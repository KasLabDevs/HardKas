[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / PlanTransactionRequest

# Interface: PlanTransactionRequest

Defined in: [packages/tx-builder/src/service.ts:21](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L21)

## Properties

### amountSompi

> **amountSompi**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:24](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L24)

***

### changeAddress?

> `optional` **changeAddress?**: `string`

Defined in: [packages/tx-builder/src/service.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L55)

Wave 13 · CHANGEADDR-1 · Explicit change-output destination.

Optional. When present, the planner routes the change output (if any) to
this address instead of `fromAddress`. Semantics are
`effectiveChangeAddress = request.changeAddress ?? request.fromAddress`
— the ONLY fallback. No inference from account aliases, execution mode,
network profile, or any orchestration state. Forwarded to the Generator's
`changeAddress` by both `planTransactionUpstream` and
`planTransactionSynthetic`.

***

### excludeOutpoints?

> `optional` **excludeOutpoints?**: `Set`\<`string`\>

Defined in: [packages/tx-builder/src/service.ts:43](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L43)

Outpoint keys ("txId:index") to exclude from coin selection (e.g. pending-spent UTXOs).

***

### feeRate?

> `optional` **feeRate?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L34)

Sompi per gram. At or below the relay minimum the plan pays the minimum (on the compute mass); above it, priority
(FEE-POLICY-1, `fee-policy.ts`).

***

### fromAddress

> **fromAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:22](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L22)

***

### networkId?

> `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/service.ts:36](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L36)

Network whose parameters the Generator applies (defaults to simnet).

***

### outputs?

> `optional` **outputs?**: `object`[]

Defined in: [packages/tx-builder/src/service.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L29)

Optional multi-output override. When present, the planner ignores
`toAddress`/`amountSompi` and pays these outputs instead.

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `bigint`

***

### toAddress

> **toAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L23)

***

### version?

> `optional` **version?**: `0` \| `1`

Defined in: [packages/tx-builder/src/service.ts:41](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L41)

Must be 0 (or absent). L1-05: the Generator prices v0 mass only (wallet/core/src/tx/mass.rs: no compute budget, no
v1 terms), so a v1 transaction is refused here (GENERATOR_V1_UNSUPPORTED); v1 plans go through `planV1Transaction`.
