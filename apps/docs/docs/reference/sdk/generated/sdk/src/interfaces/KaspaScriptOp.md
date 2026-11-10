[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / KaspaScriptOp

# Interface: KaspaScriptOp

Defined in: [packages/sdk/src/zk/toccata.ts:452](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L452)

## Properties

### data?

> `optional` **data?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:457](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L457)

Present for data pushes (OP_0, OP_DATA_1..75, OP_PUSHDATA1/2/4); hex of the pushed bytes.

***

### offset

> **offset**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:454](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L454)

Byte offset of the opcode within the script.

***

### opcode

> **opcode**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:455](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L455)
