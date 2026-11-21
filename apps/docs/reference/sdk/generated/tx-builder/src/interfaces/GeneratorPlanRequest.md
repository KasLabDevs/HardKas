[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / GeneratorPlanRequest

# Interface: GeneratorPlanRequest

Defined in: [packages/tx-builder/src/generator-plan.ts:36](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L36)

## Properties

### changeAddress

> `readonly` **changeAddress**: `string`

Defined in: [packages/tx-builder/src/generator-plan.ts:41](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L41)

***

### feeRate?

> `readonly` `optional` **feeRate?**: `bigint`

Defined in: [packages/tx-builder/src/generator-plan.ts:46](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L46)

Sompi per gram. At or below the relay minimum (100) the transaction pays the minimum, charged on the compute mass;
above it the rate is priority, priced on max(compute, storage) as the mempool ranks it (FEE-POLICY-1).

***

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/generator-plan.ts:37](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L37)

***

### outputs

> `readonly` **outputs**: readonly `object`[]

Defined in: [packages/tx-builder/src/generator-plan.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L40)

Payment outputs. Empty for a consolidation: every selected input goes to `changeAddress`.

***

### payload?

> `readonly` `optional` **payload?**: `string`

Defined in: [packages/tx-builder/src/generator-plan.ts:48](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L48)

Transaction payload (hex); the Generator prices its mass.

***

### syntheticIdentities?

> `readonly` `optional` **syntheticIdentities?**: `boolean`

Defined in: [packages/tx-builder/src/generator-plan.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L55)

Plans the simulator's identities (aliases such as `kaspa:sim_alice`, `mock-script`,
transaction ids that are not 64-hex, addresses of any network) under mass-equivalent
simnet stand-ins and maps them back. Only for the simulator: on a real network an
invalid identity must fail.

***

### utxos

> `readonly` **utxos**: readonly [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/generator-plan.ts:38](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/generator-plan.ts#L38)
