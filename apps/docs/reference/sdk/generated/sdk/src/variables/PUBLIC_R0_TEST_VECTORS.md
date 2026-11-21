[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PUBLIC\_R0\_TEST\_VECTORS

# Variable: PUBLIC\_R0\_TEST\_VECTORS

> `const` **PUBLIC\_R0\_TEST\_VECTORS**: `ReadonlyArray`\<\{ `imageId`: `string`; `journalHash`: `string`; `name`: `string`; \}\>

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:255](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L255)

Programs with a PUBLIC receipt: a valid receipt of the image id is published, so a proof-only P2SH locked to that
image id can be spent by anyone (a proof-only lock binds the image id only, whatever the journal: HK-16). The journal
hash recorded here is the published receipt's; the match is on the image id alone (C-1). HardKAS never returns a
testnet/mainnet address for a proof-only lock of these programs; an output-bound lock (whose funds go only to the
bound outputs) is built with a warning that anyone can trigger its payout at any time.
