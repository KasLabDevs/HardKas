[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / prepareEscrowRelease

# Function: prepareEscrowRelease()

> **prepareEscrowRelease**(`record`, `request`, `networkId?`): [`EscrowPreparedRelease`](../interfaces/EscrowPreparedRelease.md) \| [`EscrowRefusal`](../interfaces/EscrowRefusal.md)

Defined in: [packages/sdk/src/escrow.ts:367](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L367)

The release of `branch` (and, for mutualRelease, the allocation `mutualSplit`), drafted over the recorded funding:
the outputs the branch pays, the fee they leave (at most the escrow's fee budget, or 2,500,000 sompi without one:
ESCROW_FEE_EXCESSIVE_REFUSED; at least the node's minimum relay fee for this very release: ESCROW_FEE_BELOW_MINIMUM)
and the one draft every required signer signs. The record is not changed (applyEscrowPreparedRelease does).

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### request

#### branch

`string`

#### mutualSplit?

\{ `buyerSompi`: `string` \| `bigint`; `sellerSompi`: `string` \| `bigint`; \}

#### mutualSplit.buyerSompi

`string` \| `bigint`

#### mutualSplit.sellerSompi

`string` \| `bigint`

### networkId?

`string` = `"simnet"`

## Returns

[`EscrowPreparedRelease`](../interfaces/EscrowPreparedRelease.md) \| [`EscrowRefusal`](../interfaces/EscrowRefusal.md)
