[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SilverRecordNetworkIdSchema

# Variable: SilverRecordNetworkIdSchema

> `const` **SilverRecordNetworkIdSchema**: `ZodUnion`\<readonly \[`ZodLiteral`\<`"simnet"`\>, `ZodLiteral`\<`"devnet"`\>, `ZodString`, `ZodLiteral`\<`"mainnet"`\>\]\>

Defined in: [packages/artifacts/src/schemas.ts:1094](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1094)

INT9-A (I-1): the networks a Silver record can name. Deploy, spend and covenant records name the network they ran
on: simnet, devnet (an own `rusty-kaspad --devnet`, proven by its endpoint), or testnet-\<n\> behind the payments'
opt-in (it was simnet and testnet-\<n\> only: a devnet run was sent and its record then failed `artifact verify`).
`mainnet` is accepted ONLY so a record can be read and its integrity verified offline: no HardKAS command writes one
(Silver is refused on mainnet) and `artifact verify` never contacts a mainnet node. `simulated` is never a Silver
network: HardKAS has no Silver simulator, and a Silver record must name a verified rusty-kaspad.
