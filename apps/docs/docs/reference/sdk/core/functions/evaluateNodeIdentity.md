[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / evaluateNodeIdentity

# Function: evaluateNodeIdentity()

> **evaluateNodeIdentity**(`expected`, `observed`, `checkedAt?`): [`NodeIdentityRecord`](../interfaces/NodeIdentityRecord.md)

Defined in: [packages/core/src/node-identity.ts:101](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L101)

Compares what is running against what is expected. Pure: every fact comes
from `observed`, so it can be tested and re-evaluated from a stored record.

## Parameters

### expected

[`NodeIdentityExpectation`](../interfaces/NodeIdentityExpectation.md)

### observed

[`ObservedNode`](../interfaces/ObservedNode.md)

### checkedAt?

`Date` = `...`

## Returns

[`NodeIdentityRecord`](../interfaces/NodeIdentityRecord.md)
