[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasLocalnet

# Class: HardkasLocalnet

Defined in: [packages/sdk/src/localnet.ts:57](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L57)

HardKAS Localnet Simulation Module

## Constructors

### Constructor

> **new HardkasLocalnet**(`sdk`): `HardkasLocalnet`

Defined in: [packages/sdk/src/localnet.ts:58](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L58)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasLocalnet`

## Methods

### fund()

> **fund**(`identifier`, `options?`): `Promise`\<`LocalnetFundingResult`\>

Defined in: [packages/sdk/src/localnet.ts:152](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L152)

Funds a simulated account through the SDK transaction flow.

Toccata Docker mining/funding remains CLI-only because it shells out to
Docker: it runs the upstream Kaspa CPU miner inside the node container's
network namespace, which is host state the SDK does not own.

#### Parameters

##### identifier

`string`

##### options?

`LocalnetProfileOptions` & `object` = `{}`

#### Returns

`Promise`\<`LocalnetFundingResult`\>

***

### isAlive()

> **isAlive**(): `Promise`\<`boolean`\>

Defined in: [packages/sdk/src/localnet.ts:63](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L63)

Status check for the localnet simulation.

#### Returns

`Promise`\<`boolean`\>

***

### reset()

> **reset**(): `Promise`\<`void`\>

Defined in: [packages/sdk/src/localnet.ts:186](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L186)

Resets the localnet state (simulated or node).

#### Returns

`Promise`\<`void`\>

***

### start()

> **start**(`options?`): `Promise`\<`LocalnetControlResult`\>

Defined in: [packages/sdk/src/localnet.ts:99](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L99)

Initializes the in-memory simulated workspace.

Docker Toccata process control remains a CLI/localnet responsibility in
0.12.0-rc.23; the SDK reports that boundary instead of silently shelling out.

#### Parameters

##### options?

`LocalnetProfileOptions` = `{}`

#### Returns

`Promise`\<`LocalnetControlResult`\>

***

### status()

> **status**(`options?`): `Promise`\<`LocalnetStatusResult`\>

Defined in: [packages/sdk/src/localnet.ts:75](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L75)

Status check with the same claim boundaries as `hardkas localnet status --json`.

#### Parameters

##### options?

`LocalnetProfileOptions` = `{}`

#### Returns

`Promise`\<`LocalnetStatusResult`\>

***

### stop()

> **stop**(`options?`): `Promise`\<`LocalnetControlResult`\>

Defined in: [packages/sdk/src/localnet.ts:124](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/localnet.ts#L124)

Stops the localnet simulation or indicates lack of support for Docker termination.

#### Parameters

##### options?

`LocalnetProfileOptions` = `{}`

#### Returns

`Promise`\<`LocalnetControlResult`\>
