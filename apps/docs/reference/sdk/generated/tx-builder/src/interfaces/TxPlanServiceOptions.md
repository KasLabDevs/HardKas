[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanServiceOptions

# Interface: TxPlanServiceOptions

Defined in: [packages/tx-builder/src/service.ts:12](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L12)

## Properties

### coinbaseMaturity?

> `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:18](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L18)

Coinbase maturity, in DAA blocks, for the simulator's UTXOs
(`planTransactionSynthetic`); simnet's when unset. Real networks take it from
the SDK's network parameters.
