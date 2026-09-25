[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / silverSigFromInputSignature

# Function: silverSigFromInputSignature()

> **silverSigFromInputSignature**(`inputSignatureHex`): `Uint8Array`

Defined in: [packages/core/src/silverscript-abi.ts:173](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-abi.ts#L173)

The 65-byte `sig` value (Schnorr signature + sighash type) inside an SDK
`createInputSignature` result, which upstream returns as the P2PK signature
script `OP_DATA_65 <sig+sighash>`.

## Parameters

### inputSignatureHex

`string`

## Returns

`Uint8Array`
