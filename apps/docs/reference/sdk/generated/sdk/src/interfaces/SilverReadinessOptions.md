[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SilverReadinessOptions

# Interface: SilverReadinessOptions

Defined in: [packages/sdk/src/capabilities.ts:207](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L207)

INT9-C5 · which node the readiness checks. Default: the canonical localnet. Since L1-CORE-1 B3 `hardkas silver
deploy|spend|covenant` run on any node that proves its identity by what it reports (`--url`, or the endpoint the
workspace declares), so `hardkas silver doctor` and `hardkas capabilities` pass the node those commands would use.

## Properties

### endpoint?

> `readonly` `optional` **endpoint?**: `object`

Defined in: [packages/sdk/src/capabilities.ts:209](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L209)

A node HardKAS does not manage, proven by what it reports at `url` for `network` (never mainnet).

#### network

> `readonly` **network**: `string`

#### url

> `readonly` **url**: `string`

***

### identity?

> `readonly` `optional` **identity?**: `NodeIdentityRecord`

Defined in: [packages/sdk/src/capabilities.ts:217](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L217)

RC1-R2 (D4): the identity record the caller already probed for that same node (the endpoint's, or the canonical
localnet's when `endpoint` is absent), with its own bounded timeout: judged by the same rules, never probed again.
`hardkas doctor` passes the record its connectivity and identity sections were built from.

***

### unresolved?

> `readonly` `optional` **unresolved?**: `string`

Defined in: [packages/sdk/src/capabilities.ts:211](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L211)

No node could be chosen (why, with its code): reported as the node check, nothing contacted.
