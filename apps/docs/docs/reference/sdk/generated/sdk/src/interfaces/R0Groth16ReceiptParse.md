[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16ReceiptParse

# Interface: R0Groth16ReceiptParse

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:129](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L129)

## Properties

### claimDigest?

> `optional` **claimDigest?**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:135](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L135)

***

### claimEncoding

> **claimEncoding**: `"PRUNED_DIGEST"` \| `"UNPRUNED_VALUE"` \| `"UNKNOWN"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:134](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L134)

How the receipt carries its claim: a pruned digest (checkable) or the full value (not decoded here).

***

### issues

> **issues**: `object`[]

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:137](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L137)

#### code

> **code**: `string`

#### message

> **message**: `string`

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:130](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L130)

***

### sealHex

> **sealHex**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:132](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L132)

256-byte Groth16 seal (a || b || c, big-endian, b as [x.c1, x.c0, y.c1, y.c0]).

***

### verifierParameters?

> `optional` **verifierParameters?**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:136](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L136)
