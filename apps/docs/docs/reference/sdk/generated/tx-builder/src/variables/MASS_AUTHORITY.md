[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / MASS\_AUTHORITY

# Variable: MASS\_AUTHORITY

> `const` **MASS\_AUTHORITY**: `string`

Defined in: [packages/tx-builder/src/mass.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L12)

Transaction mass and minimum fee.

HardKAS keeps no mass constants or formulas of its own. Every value here is
computed by the pinned official SDK (`calculateTransactionMass` /
`calculateTransactionFee`) over an UNSIGNED candidate transaction: the SDK
adds `minimumSignatures` expected signatures per input, so feeding it a
signed transaction would count the signatures twice.
