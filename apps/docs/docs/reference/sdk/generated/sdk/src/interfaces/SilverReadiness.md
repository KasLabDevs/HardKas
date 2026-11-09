[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SilverReadiness

# Interface: SilverReadiness

Defined in: [packages/sdk/src/capabilities.ts:171](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L171)

The checks behind the SilverScript and covenant capabilities, in one place: `hardkas silver doctor` reports them and
`HardkasCapabilitiesApi.get()` derives `silverScript`, `covenants` and the node matrix from them.

## Properties

### node

> **node**: [`ReadinessCheck`](ReadinessCheck.md) & `object`

Defined in: [packages/sdk/src/capabilities.ts:174](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L174)

The canonical localnet node proving its identity (container, image digest, endpoint, network and version).

#### Type Declaration

##### serverVersion?

> `optional` **serverVersion?**: `string`

***

### ready

> **ready**: `object`

Defined in: [packages/sdk/src/capabilities.ts:175](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L175)

##### silver.compile.v1

> **silver.compile.v1**: `boolean`

##### silver.p2sh.deploy-spend.v1

> **silver.p2sh.deploy-spend.v1**: `boolean`

##### toccata.covenant.auth-1to1-transition.v1

> **toccata.covenant.auth-1to1-transition.v1**: `boolean`

***

### toolchains

> **toolchains**: `object`

Defined in: [packages/sdk/src/capabilities.ts:172](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L172)

#### kaspa-wasm

> **kaspa-wasm**: [`ReadinessCheck`](ReadinessCheck.md)

#### silverc

> **silverc**: [`ReadinessCheck`](ReadinessCheck.md)
