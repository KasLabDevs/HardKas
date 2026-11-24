[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowFundingAmount

# Function: escrowFundingAmount()

> **escrowFundingAmount**(`config`): `bigint`

Defined in: [packages/sdk/src/escrow.ts:204](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L204)

What a funding pays into the escrow: a legacy v1 escrow its two amounts; a v2 escrow its principal (EscrowFull) or
its two allocations (EscrowSplit) plus the fee budget (default 2,000,000 sompi), the fee of every release. The
default budget is a few times the node's minimum relay fee of an escrow release (about 300,000–600,000 sompi, 100
sompi/g of its compute mass); escrowReleaseFeeCheck refuses a budget under that minimum before anything is sent (G3).

## Parameters

### config

[`EscrowConfig`](../interfaces/EscrowConfig.md)

## Returns

`bigint`
