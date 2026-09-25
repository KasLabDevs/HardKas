[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / compileSilverSuccessor

# Function: compileSilverSuccessor()

> **compileSilverSuccessor**(`request`): `Promise`\<[`SilverSuccessor`](../interfaces/SilverSuccessor.md)\>

Defined in: [packages/core/src/silverscript-covenant.ts:142](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L142)

Compiles the current state and the successor state and checks the guard:
same template hash, same entries, same bytecode before and after the state
span, different state bytes.

## Parameters

### request

[`SilverSuccessorRequest`](../interfaces/SilverSuccessorRequest.md)

## Returns

`Promise`\<[`SilverSuccessor`](../interfaces/SilverSuccessor.md)\>
