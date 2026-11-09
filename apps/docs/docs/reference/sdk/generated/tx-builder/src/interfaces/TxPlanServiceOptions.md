[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanServiceOptions

# Interface: TxPlanServiceOptions

Defined in: [packages/tx-builder/src/service.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L11)

## Properties

### coinbaseMaturity?

> `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:17](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L17)

Coinbase maturity, in DAA blocks, for the simulator's UTXOs
(`planTransactionSynthetic`); simnet's when unset. Real networks take it from
the SDK's network parameters.
