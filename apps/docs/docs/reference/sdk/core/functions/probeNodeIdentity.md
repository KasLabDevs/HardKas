[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / probeNodeIdentity

# Function: probeNodeIdentity()

> **probeNodeIdentity**(`input`): `Promise`\<[`NodeIdentityRecord`](../interfaces/NodeIdentityRecord.md)\>

Defined in: [packages/core/src/node-identity.ts:204](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L204)

Probes Docker and the node, then evaluates. The RPC query is injected so
this package needs no RPC client; @hardkas/node-runner wires a real one.

## Parameters

### input

#### expected?

[`NodeIdentityExpectation`](../interfaces/NodeIdentityExpectation.md)

#### getServerInfo

(`url`) => `Promise`\<\{ `isSynced?`: `boolean`; `networkId`: `string`; `serverVersion`: `string`; \}\>

## Returns

`Promise`\<[`NodeIdentityRecord`](../interfaces/NodeIdentityRecord.md)\>
