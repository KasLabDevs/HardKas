[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / NodeIdentityExpectation

# Interface: NodeIdentityExpectation

Defined in: [packages/core/src/node-identity.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L13)

The node HardKAS treats as real localnet, and how to prove a running node is it.

The container name is only an operational identifier (how HardKAS finds and
manages the node). Trust comes from the combination checked by
[evaluateNodeIdentity](../functions/evaluateNodeIdentity.md): the container's image digest, the container
owning the RPC endpoint, and the network and version the node itself reports.
A container that merely carries the canonical name is not accepted.

## Properties

### containerName

> `readonly` **containerName**: `string`

Defined in: [packages/core/src/node-identity.ts:14](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L14)

***

### host

> `readonly` **host**: `string`

Defined in: [packages/core/src/node-identity.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L23)

***

### image

> `readonly` **image**: `string`

Defined in: [packages/core/src/node-identity.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L16)

Pinned image reference the node is started from.

***

### imageDigest

> `readonly` **imageDigest**: `string`

Defined in: [packages/core/src/node-identity.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L18)

Digest the running container's image must carry.

***

### network

> `readonly` **network**: `string`

Defined in: [packages/core/src/node-identity.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L20)

Network id the node must report via getServerInfo.

***

### rpcPort

> `readonly` **rpcPort**: `number`

Defined in: [packages/core/src/node-identity.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L25)

Host port of the wRPC (JSON) endpoint HardKAS talks to.

***

### serverVersion

> `readonly` **serverVersion**: `string`

Defined in: [packages/core/src/node-identity.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L22)

Server version the node must report via getServerInfo.
