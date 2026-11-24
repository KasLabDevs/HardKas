[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowReleaseFeeCheck

# Function: escrowReleaseFeeCheck()

> **escrowReleaseFeeCheck**(`record`, `totalAmount`, `mode`, `networkId?`): `object`

Defined in: [packages/sdk/src/escrow.ts:245](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L245)

G3 · before an escrow is funded, each branch of its contract, with the outputs the lifecycle prepares for it (the
default resolution), is drafted against the funding it would receive (prepareSilverSpend, offline: the node's
minimum relay fee and mass limits). The contract pins the outputs, so the fee of every release is what the funding
adds to them (the fee budget): below the node's minimum, the escrow could never be released by its one input, and it
is not funded. A branch whose default outputs are above the node's storage-mass limit (a small allocation) is only a
warning: another split or another branch still releases the escrow. Legacy v1 escrows (no budget) are not checked.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### totalAmount

`bigint`

### mode

`"full"` \| `"split"`

### networkId?

`string` = `"simnet"`

## Returns

`object`

### refusal?

> `optional` **refusal?**: `string`

### warnings

> **warnings**: `string`[]
