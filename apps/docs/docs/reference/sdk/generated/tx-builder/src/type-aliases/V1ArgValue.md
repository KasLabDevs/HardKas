[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1ArgValue

# Type Alias: V1ArgValue

> **V1ArgValue** = \{ `kind`: `"int"`; `value`: `string`; \} \| \{ `kind`: `"bool"`; `value`: `boolean`; \} \| \{ `kind`: `"byte"`; `value`: `number`; \} \| \{ `kind`: `"bytes"`; `value`: readonly `number`[]; \} \| \{ `kind`: `"text"`; `value`: `string`; \} \| \{ `kind`: `"array"`; `value`: readonly `V1ArgValue`[]; \} \| \{ `kind`: `"object"`; `value`: `Readonly`\<`Record`\<`string`, `V1ArgValue`\>\>; \} \| [`V1SignerSlot`](../interfaces/V1SignerSlot.md)

Defined in: [packages/tx-builder/src/v1-plan.ts:22](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L22)

A constructor or entry argument in silverscript-abi's \{kind, value\} form (ints as decimal strings), or a signer slot.
