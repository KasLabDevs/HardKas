[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / inspectNodeContainer

# Function: inspectNodeContainer()

> **inspectNodeContainer**(`containerName`): `Promise`\<[`ObservedContainer`](../interfaces/ObservedContainer.md) \| `undefined`\>

Defined in: [packages/core/src/node-identity.ts:164](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L164)

Reads a container's identity-relevant facts from Docker. Returns undefined
when no container has that name; throws when Docker itself is unreachable.

## Parameters

### containerName

`string`

## Returns

`Promise`\<[`ObservedContainer`](../interfaces/ObservedContainer.md) \| `undefined`\>
