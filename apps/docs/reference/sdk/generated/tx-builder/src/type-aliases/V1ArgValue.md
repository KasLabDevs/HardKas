[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1ArgValue

# Type Alias: V1ArgValue

> **V1ArgValue** = \{ `kind`: `"int"`; `value`: `string`; \} \| \{ `kind`: `"bool"`; `value`: `boolean`; \} \| \{ `kind`: `"byte"`; `value`: `number`; \} \| \{ `kind`: `"bytes"`; `value`: readonly `number`[]; \} \| \{ `kind`: `"text"`; `value`: `string`; \} \| \{ `kind`: `"array"`; `value`: readonly `V1ArgValue`[]; \} \| \{ `kind`: `"object"`; `value`: `Readonly`\<`Record`\<`string`, `V1ArgValue`\>\>; \} \| [`V1SignerSlot`](../interfaces/V1SignerSlot.md)

Defined in: [packages/tx-builder/src/v1-plan.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L23)

A constructor or entry argument in silverscript-abi's \{kind, value\} form (ints as decimal strings), or a signer slot.
