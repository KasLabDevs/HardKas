[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16VerifyScriptsResult

# Interface: R0Groth16VerifyScriptsResult

Defined in: [packages/sdk/src/zk/toccata.ts:460](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L460)

## Properties

### bindingMode?

> `optional` **bindingMode?**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:478](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L478)

***

### boundPayoutAmount?

> `optional` **boundPayoutAmount?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:490](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L490)

***

### boundPayoutSpk?

> `optional` **boundPayoutSpk?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:489](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L489)

***

### consensusEnforced?

> `optional` **consensusEnforced?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:479](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L479)

***

### enforcesInputAmountLimit?

> `optional` **enforcesInputAmountLimit?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:488](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L488)

OpTxInputAmount .. OpLessThanOrEqual: the spent UTXO is at most the bound outputs plus the fee cap.

***

### enforcesOutputCount?

> `optional` **enforcesOutputCount?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:481](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L481)

***

### enforcesPayoutAmount?

> `optional` **enforcesPayoutAmount?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:483](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L483)

***

### enforcesPayoutSpk?

> `optional` **enforcesPayoutSpk?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:482](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L482)

***

### enforcesSingleInput?

> `optional` **enforcesSingleInput?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:486](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L486)

OpTxInputCount: the spend has exactly one input.

***

### enforcesUtxoBinding?

> `optional` **enforcesUtxoBinding?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:484](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L484)

***

### hasGroth16Tag

> **hasGroth16Tag**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:465](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L465)

The opcode before it is a 1-byte push of the Groth16 tag 0x20.

***

### hasOpZkPrecompile

> **hasOpZkPrecompile**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:463](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L463)

The redeem script's LAST opcode is OpZkPrecompile (0xa6).

***

### hasOutputIntrospection?

> `optional` **hasOutputIntrospection?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:480](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L480)

***

### imageIdFound?

> `optional` **imageIdFound?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:476](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L476)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:491](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L491)

***

### journalHashFound?

> `optional` **journalHashFound?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:477](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L477)

***

### largestRedeemPushBytes

> **largestRedeemPushBytes**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:475](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L475)

Largest single data push in the redeem script (the embedded RISC Zero verifying key), in bytes.

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:461](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L461)

***

### proofPushFound

> **proofPushFound**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:471](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L471)

The signature script contains a 128-byte push (the compressed Groth16 proof).

***

### redeemOps

> **redeemOps**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:468](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L468)

***

### redeemScriptEmbedded

> **redeemScriptEmbedded**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:473](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L473)

The signature script's last push equals the redeem script (P2SH spend shape).

***

### redeemScriptLength

> **redeemScriptLength**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:466](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L466)

***

### sigOps

> **sigOps**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:469](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L469)

***

### sigScriptLength

> **sigScriptLength**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:467](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L467)
