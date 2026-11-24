[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / deriveObserverId

# Function: deriveObserverId()

> **deriveObserverId**(`input`): `string`

Defined in: [packages/artifacts/src/tx-observation.ts:118](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-observation.ts#L118)

The opaque, stable identity of a HardKAS observer instance: a domain digest of
what configures it (its kind, the configured target and its raw locator). Same
configuration ⇒ same observer ⇒ ONE history; the locator itself is never exposed.

## Parameters

### input

#### kind

`"rpc"` \| `"synthetic"`

#### locator?

`string`

#### target

`string`

## Returns

`string`
