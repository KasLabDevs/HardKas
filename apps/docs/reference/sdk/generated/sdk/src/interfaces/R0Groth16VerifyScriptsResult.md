[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16VerifyScriptsResult

# Interface: R0Groth16VerifyScriptsResult

Defined in: [packages/sdk/src/zk/toccata.ts:508](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L508)

## Properties

### bindingMode?

> `optional` **bindingMode?**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:542](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L542)

***

### boundChangeAmount?

> `optional` **boundChangeAmount?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:565](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L565)

***

### boundChangeSpk?

> `optional` **boundChangeSpk?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:564](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L564)

***

### boundMaxInputSompi?

> `optional` **boundMaxInputSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:567](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L567)

The largest input the lock accepts (bound outputs plus the fee cap it was built with).

***

### boundOutputCount?

> `optional` **boundOutputCount?**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:561](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L561)

1 (payout) or 2 (payout and change).

***

### boundPayoutAmount?

> `optional` **boundPayoutAmount?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:563](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L563)

***

### boundPayoutSpk?

> `optional` **boundPayoutSpk?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:562](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L562)

***

### consensusEnforced?

> `optional` **consensusEnforced?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:547](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L547)

true only for a canonical proof-and-output-bound lock over the pinned verifier with no issue. Never inferred from the
presence of opcodes. The `enforces*` and `bound*` fields below are set from that byte-exact reconstruction only.

***

### controlIdPinned

> **controlIdPinned**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:541](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L541)

The script pushes R0_GROTH16_BN254_CONTROL_ID.

***

### controlRootPinned

> **controlRootPinned**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:539](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L539)

The script pushes split_digest(R0_GROTH16_CONTROL_ROOT): both 16-byte halves, zero-padded to 32 bytes.

***

### enforcesChangeAmount?

> `optional` **enforcesChangeAmount?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:553](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L553)

***

### enforcesChangeSpk?

> `optional` **enforcesChangeSpk?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:552](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L552)

***

### enforcesInputAmountLimit?

> `optional` **enforcesInputAmountLimit?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:559](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L559)

OpTxInputAmount .. OpLessThanOrEqual: the spent UTXO is at most the bound outputs plus the fee cap.

***

### enforcesOutputCount?

> `optional` **enforcesOutputCount?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:549](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L549)

***

### enforcesPayoutAmount?

> `optional` **enforcesPayoutAmount?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:551](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L551)

***

### enforcesPayoutSpk?

> `optional` **enforcesPayoutSpk?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:550](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L550)

***

### enforcesSingleInput?

> `optional` **enforcesSingleInput?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:557](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L557)

OpTxInputCount: the spend has exactly one input.

***

### enforcesUtxoBinding?

> `optional` **enforcesUtxoBinding?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:555](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L555)

The script contains OpOutpointTxId (a defect: no spend can satisfy an outpoint binding).

***

### hasGroth16Tag

> **hasGroth16Tag**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:513](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L513)

The opcode before it is a 1-byte push of the Groth16 tag 0x20.

***

### hasOpZkPrecompile

> **hasOpZkPrecompile**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:511](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L511)

The redeem script's LAST opcode is OpZkPrecompile (0xa6).

***

### hasOutputIntrospection?

> `optional` **hasOutputIntrospection?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:548](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L548)

***

### imageIdFound?

> `optional` **imageIdFound?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:524](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L524)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:568](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L568)

***

### journalHashFound?

> `optional` **journalHashFound?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:525](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L525)

***

### largestRedeemPushBytes

> **largestRedeemPushBytes**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:523](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L523)

Largest single data push in the redeem script (the embedded RISC Zero verifying key), in bytes.

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:509](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L509)

***

### proofPushFound

> **proofPushFound**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:519](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L519)

The signature script contains a 128-byte push (the compressed Groth16 proof).

***

### redeemOps

> **redeemOps**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:516](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L516)

***

### redeemScriptCanonical

> **redeemScriptCanonical**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:530](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L530)

The redeem script is byte-identical to the script HardKAS builds for the parameters read back from it (the image id;
in output-bound mode the outputs and the input limit), with the builders buildR0Groth16Scripts uses (crypto review H2).

***

### redeemScriptEmbedded

> **redeemScriptEmbedded**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:521](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L521)

The signature script's last push equals the redeem script (P2SH spend shape).

***

### redeemScriptLength

> **redeemScriptLength**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:514](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L514)

***

### scriptImageId?

> `optional` **scriptImageId?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:532](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L532)

The image id a canonical redeem script commits to.

***

### sigOps

> **sigOps**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:517](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L517)

***

### sigScriptLength

> **sigScriptLength**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:515](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L515)

***

### verifyingKeyPinned

> **verifyingKeyPinned**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:537](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L537)

The verifying key handed to OpZkPrecompile (the push right before the Groth16 tag) is the pinned RISC Zero key,
R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX (crypto review H1).
