[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / PlanTransactionRequest

# Interface: PlanTransactionRequest

Defined in: [packages/tx-builder/src/service.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L20)

## Properties

### amountSompi

> **amountSompi**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L23)

***

### changeAddress?

> `optional` **changeAddress?**: `string`

Defined in: [packages/tx-builder/src/service.ts:58](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L58)

Wave 13 · CHANGEADDR-1 · Explicit change-output destination.

Optional. When present, the selected planner routes the change output
(if any) to this address instead of `fromAddress`. Semantics are
`effectiveChangeAddress = request.changeAddress ?? request.fromAddress`
— the ONLY fallback. No inference from account aliases, execution mode,
network profile, or any orchestration state.

Forwarded by:
  - `planTransactionUpstream` → kaspa-wasm `buildTransactions.changeAddress`
  - `planTransaction` / `planTransactionSynthetic` → `buildPaymentPlan.changeAddress`

Preserves pre-Wave-13 behaviour when omitted: every existing caller
whose object literal does NOT set this field continues to route change
to `fromAddress`. Adding the field is backward-compatible; no existing
call sites require migration.

***

### excludeOutpoints?

> `optional` **excludeOutpoints?**: `Set`\<`string`\>

Defined in: [packages/tx-builder/src/service.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L39)

Outpoint keys ("txId:index") to exclude from coin selection (e.g. pending-spent UTXOs).

***

### feeEstimator?

> `optional` **feeEstimator?**: (`inputs`, `outputs`) => `Promise`\<`bigint`\>

Defined in: [packages/tx-builder/src/service.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L36)

#### Parameters

##### inputs

`number`

##### outputs

`number`

#### Returns

`Promise`\<`bigint`\>

***

### feePolicy?

> `optional` **feePolicy?**: `"legacy"` \| `"toccata"` \| `"auto"`

Defined in: [packages/tx-builder/src/service.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L35)

***

### feeRate?

> `optional` **feeRate?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L31)

***

### fromAddress

> **fromAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L21)

***

### genesisCovenantGroups?

> `optional` **genesisCovenantGroups?**: `object`[]

Defined in: [packages/tx-builder/src/service.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L37)

#### authorizingInput

> **authorizingInput**: `number`

#### outputIndices

> **outputIndices**: `number`[]

***

### networkId?

> `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/service.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L33)

Network whose mass parameters the SDK applies (defaults to simnet).

***

### outputs?

> `optional` **outputs?**: `object`[]

Defined in: [packages/tx-builder/src/service.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L30)

Optional multi-output override for the upstream planner
(`planTransactionUpstream`). When present, the planner ignores
`toAddress`/`amountSompi` and pays these outputs instead. Ignored by the
legacy `planTransaction` path.

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `bigint`

***

### toAddress

> **toAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L22)

***

### version?

> `optional` **version?**: `0` \| `1`

Defined in: [packages/tx-builder/src/service.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L34)
