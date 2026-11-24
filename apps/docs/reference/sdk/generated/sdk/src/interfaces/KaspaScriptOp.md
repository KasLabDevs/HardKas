[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / KaspaScriptOp

# Interface: KaspaScriptOp

Defined in: [packages/sdk/src/zk/toccata.ts:500](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L500)

## Properties

### data?

> `optional` **data?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:505](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L505)

Present for data pushes (OP_0, OP_DATA_1..75, OP_PUSHDATA1/2/4); hex of the pushed bytes.

***

### offset

> **offset**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:502](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L502)

Byte offset of the opcode within the script.

***

### opcode

> **opcode**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:503](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L503)
