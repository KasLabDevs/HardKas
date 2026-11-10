[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / createZkOutputBindingJournal

# Function: createZkOutputBindingJournal()

> **createZkOutputBindingJournal**(`params`): [`ZkJournalBindingResult`](../interfaces/ZkJournalBindingResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:275](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L275)

Creates a canonical, domain-separated journal for zkVM applications committing to transaction outputs.
Domain: HARDKAS_ZK_OUTPUT_BINDING_V1
Layout: [0..4] "HKZ1" | [4..36] SPK SHA-256 | [36..44] Amount u64 LE | [44..76] Outpoint Digest | [76..108] Nonce

OFF-CHAIN CONVENTION ONLY: no HardKAS lock checks this journal. The redeem scripts verify a receipt of the image id
for whatever journal hash the spender supplies; the outputs are bound by introspection in proof-and-output-bound
mode, not through the journal. The fields mean something only if the guest program enforces them.

## Parameters

### params

[`ZkJournalBindingParams`](../interfaces/ZkJournalBindingParams.md)

## Returns

[`ZkJournalBindingResult`](../interfaces/ZkJournalBindingResult.md)
