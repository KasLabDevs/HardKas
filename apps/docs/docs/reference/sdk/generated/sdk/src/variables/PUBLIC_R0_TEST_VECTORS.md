[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PUBLIC\_R0\_TEST\_VECTORS

# Variable: PUBLIC\_R0\_TEST\_VECTORS

> `const` **PUBLIC\_R0\_TEST\_VECTORS**: `ReadonlyArray`\<\{ `imageId`: `string`; `journalHash`: `string`; `name`: `string`; \}\>

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:229](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L229)

Receipts that are PUBLIC: their (imageId, journalHash) claim has a published valid receipt, so a P2SH
locked to that image id can be spent by anyone (the R0 lock binds only the image id; HK-16). HardKAS
never returns testnet/mainnet addresses for these.
