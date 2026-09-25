[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / parseHardkasConfig

# Function: parseHardkasConfig()

> **parseHardkasConfig**(`input`): `object`

Defined in: [packages/core/src/index.ts:118](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/index.ts#L118)

## Parameters

### input

`unknown`

## Returns

`object`

### localnet

> **localnet**: `object`

#### localnet.dataDir?

> `optional` **dataDir?**: `string`

#### localnet.mode

> **mode**: `"simulator"` \| `"local-node"`

### network

> **network**: `object`

#### network.id

> **id**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

#### network.rpcUrl?

> `optional` **rpcUrl?**: `string`

### project

> **project**: `object`

#### project.name

> **name**: `string`

#### project.root

> **root**: `string`
