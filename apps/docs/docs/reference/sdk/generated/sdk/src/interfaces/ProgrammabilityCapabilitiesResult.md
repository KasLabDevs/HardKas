[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ProgrammabilityCapabilitiesResult

# Interface: ProgrammabilityCapabilitiesResult

Defined in: [packages/sdk/src/programmability.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L49)

## Properties

### claims

> **claims**: [`ProgrammabilityClaims`](ProgrammabilityClaims.md)

Defined in: [packages/sdk/src/programmability.ts:60](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L60)

***

### nonClaims

> **nonClaims**: `string`[]

Defined in: [packages/sdk/src/programmability.ts:61](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L61)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/programmability.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L50)

***

### schema

> **schema**: `"hardkas.programmability.capabilities.v1"`

Defined in: [packages/sdk/src/programmability.ts:51](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L51)

***

### status

> **status**: `"PROGRAMMABILITY_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:52](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L52)

***

### surfaces

> **surfaces**: `object`

Defined in: [packages/sdk/src/programmability.ts:53](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L53)

#### groth16FixtureCoherence

> **groth16FixtureCoherence**: `"READY_GROTH16_FIXTURE_COHERENCE"`

#### risc0Inspect

> **risc0Inspect**: `"RISC0_INSPECT_SURFACE_READY"`

#### silverScript

> **silverScript**: `"SILVERSCRIPT_V1_LIFECYCLE"`

#### vProgsInspect

> **vProgsInspect**: `"VPROGS_INSPECT_SURFACE_READY"`

#### zkCorpus

> **zkCorpus**: `"ZK_CORPUS_SURFACE_READY"`
