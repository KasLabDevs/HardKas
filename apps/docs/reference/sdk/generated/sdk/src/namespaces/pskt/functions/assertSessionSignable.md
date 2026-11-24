[**HardKAS SDK**](../../../../../README.md)

***

[HardKAS SDK](../../../../../README.md) / [sdk/src](../../../README.md) / [pskt](../README.md) / assertSessionSignable

# Function: assertSessionSignable()

> **assertSessionSignable**(`session`, `inputIndexes`, `context`): `Promise`\<`void`\>

Defined in: [packages/sdk/src/pskt.ts:406](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt.ts#L406)

A1 (audit 2026-11-13): checks, without any key, that a session may be signed by this caller: the caller's own network
(`context.networkId`) is given, is the session's and is not mainnet, and the caller's node (`context.node`) lists every
input to be signed as unspent. Fail closed (PSKT_SIGNER_NETWORK_REQUIRED, PSKT_NETWORK_MISMATCH,
PSKT_INPUTS_UNVERIFIED, PSKT_INPUT_NOT_ON_NETWORK). `signSession` runs it; a caller may run it before it reads a key.

## Parameters

### session

`PortableSigningSession`

### inputIndexes

readonly `number`[]

### context

[`PsktSignContext`](../interfaces/PsktSignContext.md)

## Returns

`Promise`\<`void`\>
