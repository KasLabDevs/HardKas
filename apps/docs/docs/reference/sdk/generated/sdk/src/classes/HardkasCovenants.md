[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCovenants

# Class: HardkasCovenants

Defined in: [packages/sdk/src/covenants.ts:121](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L121)

HardKAS Covenants — Kaspa L1 Core

Provides the covenant lifecycle interface for Kaspa L1 post-Toccata.
Covenants are protocol-native, recursive spending rules embedded in UTXOs,
enforced at the consensus layer (KIP-17, KIP-20).

This is NOT experimental — covenants are live on Kaspa mainnet since
DAA score 474,165,565 (June 30, 2026).

**Current limitations (0.12.0-rc.23):**
- TX V1 signing requires kaspa-wasm V1 support (see P82)
- Plan/sign/send pipeline for covenants will be implemented in P84
- For now, capability checks and inspection are available

## See

https://github.com/kaspanet/rusty-kaspa/blob/master/docs/toccata-guide.md

## Constructors

### Constructor

> **new HardkasCovenants**(`sdk`): `HardkasCovenants`

Defined in: [packages/sdk/src/covenants.ts:122](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L122)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasCovenants`

## Methods

### ~~buildCovenant()~~

> **buildCovenant**(`options`): `Promise`\<`CovenantArtifact`\>

Defined in: [packages/sdk/src/covenants.ts:221](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L221)

Build a covenant artifact (legacy compatibility).

#### Parameters

##### options

###### computeBudget?

`number`

###### covenant?

`string`

###### scriptHash

`string`

###### userLane?

`string`

#### Returns

`Promise`\<`CovenantArtifact`\>

#### Deprecated

Use `planDeploy()` instead. This method exists for backward
compatibility with code that used `hardkas.experimental.toccata.buildCovenant()`.

***

### checkCapabilities()

> **checkCapabilities**(): `Promise`\<`CovenantCapabilityResult`\>

Defined in: [packages/sdk/src/covenants.ts:131](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L131)

Check whether the runtime environment supports covenants.

Checks:
1. Connected node is Toccata-enabled (supports TX V1)
2. kaspa-wasm can sign TX V1 transactions

#### Returns

`Promise`\<`CovenantCapabilityResult`\>

***

### getState()

> **getState**(`covenantId`): `Promise`\<`CovenantState`\>

Defined in: [packages/sdk/src/covenants.ts:207](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L207)

Get the current state of a covenant from the UTXO set.

#### Parameters

##### covenantId

`string`

#### Returns

`Promise`\<`CovenantState`\>

#### Throws

COVENANT_STATE_NOT_IMPLEMENTED — requires Toccata RPC integration.

***

### inspect()

> **inspect**(`covenantId`): `Promise`\<`CovenantInfo`\>

Defined in: [packages/sdk/src/covenants.ts:162](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L162)

Inspect a covenant by its 32-byte covenant ID.

This is a read-only RPC operation that does not require TX V1 signing.

#### Parameters

##### covenantId

`string`

#### Returns

`Promise`\<`CovenantInfo`\>

#### Throws

COVENANT_INSPECT_NOT_IMPLEMENTED — will be implemented
  when RPC integration for covenant queries is complete.

***

### isSupported()

> **isSupported**(): `Promise`\<`boolean`\>

Defined in: [packages/sdk/src/covenants.ts:149](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L149)

Check if the connected node supports covenants (convenience shorthand).

#### Returns

`Promise`\<`boolean`\>

***

### planDeploy()

> **planDeploy**(`options`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:170](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L170)

#### Parameters

##### options

`CovenantDeployOptions`

#### Returns

`Promise`\<`any`\>

***

### planSpend()

> **planSpend**(`options`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:189](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/covenants.ts#L189)

Plan a covenant spend transaction.

Creates a TX V1 plan that satisfies the covenant's spending rules.
The plan must be signed and broadcast separately.

#### Parameters

##### options

`CovenantSpendOptions`

#### Returns

`Promise`\<`any`\>
