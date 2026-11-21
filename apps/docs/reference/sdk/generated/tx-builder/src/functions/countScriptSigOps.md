[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / countScriptSigOps

# Function: countScriptSigOps()

> **countScriptSigOps**(`script`): `number`

Defined in: [packages/tx-builder/src/v1-budgets.ts:149](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-budgets.ts#L149)

The signature operations a static scan of `script` finds (sigOpsOf over its opcodes, the from-stack checks included), the
scan the budget estimate below uses, exported unchanged. For a P2SH redeem script it is what the mempool compares with
its standardness limit of 15 per input (rusty-kaspa mining/src/mempool/check_transaction_standard.rs, its post-Toccata
P2SH scanner, which counts the from-stack checks too): every entry and every inlined helper call site of the script,
whatever entry a spend calls. Two differences from that scanner, both toward more: a multisig whose key count is pushed
as data (not OP_1..OP_16) counts 20 here, and a script that stops parsing counts what was read (the node counts 0).

## Parameters

### script

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

## Returns

`number`
