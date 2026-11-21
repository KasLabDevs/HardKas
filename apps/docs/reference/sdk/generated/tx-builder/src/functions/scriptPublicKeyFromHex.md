[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / scriptPublicKeyFromHex

# Function: scriptPublicKeyFromHex()

> **scriptPublicKeyFromHex**(`spk`): `object`

Defined in: [packages/tx-builder/src/mass.ts:121](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L121)

L1-12 · a scriptPublicKey given as a hex string (ADJ-002 transport rule): the node's JSON form "\<2-byte version as 4 hex\>
\<script\>" when it starts with `0000` (version 0, a script of ANY length: P2PK Schnorr 34 bytes, P2PK ECDSA 35, P2SH 35,
...); any other hex string is a bare version-0 script. The same rule as the Generator planner (generator-plan.ts
`ownScriptHex`). It used to apply to 72-hex strings (a 34-byte script) only, so a versioned P2SH or ECDSA string was
read as a 37-byte bare script. Not hex (or an odd length): undefined.

## Parameters

### spk

`string`

## Returns

`object`

### script

> **script**: `string`

### version

> **version**: `number`
