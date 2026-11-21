[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SilverReadiness

# Interface: SilverReadiness

Defined in: [packages/sdk/src/capabilities.ts:176](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L176)

The checks behind the SilverScript and covenant capabilities, in one place: `hardkas silver doctor` reports them and
`HardkasCapabilitiesApi.get()` derives `silverScript`, `covenants` and the node matrix from them.

## Properties

### node

> **node**: [`ReadinessCheck`](ReadinessCheck.md) & `object`

Defined in: [packages/sdk/src/capabilities.ts:184](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L184)

The node the Silver on-chain commands would use, proving its identity (INT9-C5): the canonical localnet by container,
image digest, endpoint, network and version (`verification: "canonical"`); any other node by what it reports at its
endpoint — network, this release's version, synced, not the simulator (`"endpoint"`); `"unresolved"` when no node
could be chosen (a refused network, no endpoint declared), nothing contacted.

#### Type Declaration

##### network?

> `optional` **network?**: `string`

##### notSynced?

> `optional` **notSynced?**: `boolean`

INT9 (A × C5): the node proved its identity but does not say it is synced. Being synced is a verdict apart from
identity, and the Silver on-chain commands require it on every node (NODE_NOT_SYNCED), so the node is not ready.

##### serverVersion?

> `optional` **serverVersion?**: `string`

##### url?

> `optional` **url?**: `string`

##### verification?

> `optional` **verification?**: `"endpoint"` \| `"unresolved"` \| `"canonical"`

***

### ready

> **ready**: `object`

Defined in: [packages/sdk/src/capabilities.ts:195](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L195)

##### silver.compile.v1

> **silver.compile.v1**: `boolean`

##### silver.p2sh.deploy-spend.v1

> **silver.p2sh.deploy-spend.v1**: `boolean`

##### toccata.covenant.auth-1to1-transition.v1

> **toccata.covenant.auth-1to1-transition.v1**: `boolean`

***

### toolchains

> **toolchains**: `object`

Defined in: [packages/sdk/src/capabilities.ts:177](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L177)

#### kaspa-wasm

> **kaspa-wasm**: [`ReadinessCheck`](ReadinessCheck.md)

#### silverc

> **silverc**: [`ReadinessCheck`](ReadinessCheck.md)
