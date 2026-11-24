[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16ReceiptParse

# Interface: R0Groth16ReceiptParse

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:153](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L153)

## Properties

### claimDigest?

> `optional` **claimDigest?**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:159](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L159)

***

### claimEncoding

> **claimEncoding**: `"PRUNED_DIGEST"` \| `"UNPRUNED_VALUE"` \| `"UNKNOWN"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:158](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L158)

How the receipt carries its claim: a pruned digest (checkable) or the full value (not decoded here).

***

### issues

> **issues**: `object`[]

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:161](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L161)

#### code

> **code**: `string`

#### message

> **message**: `string`

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:154](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L154)

***

### sealHex

> **sealHex**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:156](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L156)

256-byte Groth16 seal (a || b || c, big-endian, b as [x.c1, x.c0, y.c1, y.c0]).

***

### verifierParameters?

> `optional` **verifierParameters?**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:160](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L160)
