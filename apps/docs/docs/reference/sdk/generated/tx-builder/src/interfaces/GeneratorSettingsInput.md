[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / GeneratorSettingsInput

# Interface: GeneratorSettingsInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L33)

Generator settings passed through unchanged to the WASM SDK.
See kaspa-wasm's `IGeneratorSettingsObject` for the full field list. We
accept `any` for `entries`/`outputs`/`priorityFee` because the SDK accepts
multiple shapes (arrays, single object, `UtxoContext`, `PaymentOutput`, etc.);
validating here would drift from upstream.

## Properties

### changeAddress

> `readonly` **changeAddress**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L37)

***

### entries

> `readonly` **entries**: `unknown`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L35)

***

### minimumSignatures?

> `readonly` `optional` **minimumSignatures?**: `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:41](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L41)

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L34)

***

### outputs

> `readonly` **outputs**: `unknown`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L36)

***

### payload?

> `readonly` `optional` **payload?**: `string` \| `Uint8Array`\<`ArrayBufferLike`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L39)

***

### priorityFee?

> `readonly` `optional` **priorityFee?**: `number` \| `bigint` \| \{ `amount`: `bigint`; \} \| \{ `rate`: `bigint`; \}

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L38)

***

### sigOpCount?

> `readonly` `optional` **sigOpCount?**: `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L40)
