[**HardKAS SDK**](../../../../../README.md)

***

[HardKAS SDK](../../../../../README.md) / [sdk/src](../../../README.md) / [pskt](../README.md) / PsktUtxoSource

# Interface: PsktUtxoSource

Defined in: [packages/sdk/src/pskt/input-verification.ts:18](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt/input-verification.ts#L18)

What a PSKT signer's node must answer: the unspent outputs it holds at an address.

## Methods

### getUtxosByAddress()

> **getUtxosByAddress**(`address`): `Promise`\<readonly `unknown`[]\>

Defined in: [packages/sdk/src/pskt/input-verification.ts:19](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt/input-verification.ts#L19)

#### Parameters

##### address

`string`

#### Returns

`Promise`\<readonly `unknown`[]\>
