[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / GeneratorSettingsInput

# Interface: GeneratorSettingsInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L32)

Generator settings passed through unchanged to the WASM SDK.
See kaspa-wasm's `IGeneratorSettingsObject` for the full field list. We
accept `any` for `entries`/`outputs`/`priorityFee` because the SDK accepts
multiple shapes (arrays, single object, `UtxoContext`, `PaymentOutput`, etc.);
validating here would drift from upstream.

## Properties

### changeAddress

> `readonly` **changeAddress**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:37](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L37)

***

### entries

> `readonly` **entries**: `unknown`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L34)

***

### feeRate?

> `readonly` `optional` **feeRate?**: `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:41](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L41)

Fee rate in sompi per gram, applied by the Generator to every transaction it builds (never below the network minimum).

***

### minimumSignatures?

> `readonly` `optional` **minimumSignatures?**: `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L44)

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L33)

***

### outputs?

> `readonly` `optional` **outputs?**: `unknown`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L36)

Payment outputs. Omit them (an empty list is refused) for a sweep: everything goes to `changeAddress`.

***

### payload?

> `readonly` `optional` **payload?**: `string` \| `Uint8Array`\<`ArrayBufferLike`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L42)

***

### priorityFee?

> `readonly` `optional` **priorityFee?**: `number` \| `bigint` \| \{ `amount`: `bigint`; \}

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L39)

Absolute extra fee in sompi (sender pays). Set it, even to 0, when there are outputs; leave it unset for a compound.

***

### sigOpCount?

> `readonly` `optional` **sigOpCount?**: `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:43](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L43)
