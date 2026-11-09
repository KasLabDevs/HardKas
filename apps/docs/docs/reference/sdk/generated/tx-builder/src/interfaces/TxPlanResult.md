[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanResult

# Interface: TxPlanResult

Defined in: [packages/tx-builder/src/service.ts:89](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L89)

## Properties

### plan

> **plan**: [`TxPlan`](TxPlan.md)

Defined in: [packages/tx-builder/src/service.ts:90](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L90)

***

### plannerAuthority?

> `optional` **plannerAuthority?**: [`PlannerAuthority`](../type-aliases/PlannerAuthority.md)

Defined in: [packages/tx-builder/src/service.ts:99](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L99)

Provenance of the plan; set on every plan.

***

### plannerAuthorityDetail?

> `optional` **plannerAuthorityDetail?**: `string`

Defined in: [packages/tx-builder/src/service.ts:104](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L104)

Optional free-form detail for the authority (e.g. `kaspa-wasm@<version>`).
Never a substitute for `plannerAuthority`.

***

### utxoSelection

> **utxoSelection**: `object`

Defined in: [packages/tx-builder/src/service.ts:91](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L91)

#### purpose?

> `optional` **purpose?**: `"wallet-consolidation"`

#### selectedUtxos

> **selectedUtxos**: `number`

#### selectionStrategy

> **selectionStrategy**: `"consolidation-smallest-first"` \| `"upstream-generator"`

#### totalUtxosSeen

> **totalUtxosSeen**: `number`

#### warnings?

> `optional` **warnings?**: `string`[]
