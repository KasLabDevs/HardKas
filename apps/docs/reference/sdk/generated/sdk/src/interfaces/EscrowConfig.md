[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowConfig

# Interface: EscrowConfig

Defined in: packages/sdk/src/escrow-core/types.ts:11

## Properties

### arbiter

> **arbiter**: [`EscrowParticipant`](EscrowParticipant.md)

Defined in: packages/sdk/src/escrow-core/types.ts:14

***

### buyer

> **buyer**: [`EscrowParticipant`](EscrowParticipant.md)

Defined in: packages/sdk/src/escrow-core/types.ts:12

***

### buyerAmount?

> `optional` **buyerAmount?**: `string` \| `bigint`

Defined in: packages/sdk/src/escrow-core/types.ts:29

For Split mode: buyer's allocated amount in sompi.

***

### buyerDestinationSpk

> **buyerDestinationSpk**: `string`

Defined in: packages/sdk/src/escrow-core/types.ts:16

Script public key (without version) the refund pays.

***

### escrowNonce?

> `optional` **escrowNonce?**: `string`

Defined in: packages/sdk/src/escrow-core/types.ts:41

32-byte random hex string ensuring unique P2SH address. Auto-generated if omitted.

***

### feeBudgetSompi?

> `optional` **feeBudgetSompi?**: `string` \| `bigint`

Defined in: packages/sdk/src/escrow-core/types.ts:38

Maximum allowed network fee budget for the spend in sompi (default 400_000).

***

### mode?

> `optional` **mode?**: [`EscrowMode`](../type-aliases/EscrowMode.md)

Defined in: packages/sdk/src/escrow-core/types.ts:21

Mode: "full" for single principal, "split" for pre-allocated dual amounts. Default: "full".

***

### principal?

> `optional` **principal?**: `string` \| `bigint`

Defined in: packages/sdk/src/escrow-core/types.ts:26

For Full mode: total principal amount in sompi.

***

### refundAmount?

> `optional` **refundAmount?**: `string` \| `bigint`

Defined in: packages/sdk/src/escrow-core/types.ts:34

Legacy compatibility: maps to principal or split amounts.

***

### releaseAmount?

> `optional` **releaseAmount?**: `string` \| `bigint`

Defined in: packages/sdk/src/escrow-core/types.ts:35

***

### seller

> **seller**: [`EscrowParticipant`](EscrowParticipant.md)

Defined in: packages/sdk/src/escrow-core/types.ts:13

***

### sellerAmount?

> `optional` **sellerAmount?**: `string` \| `bigint`

Defined in: packages/sdk/src/escrow-core/types.ts:31

For Split mode: seller's allocated amount in sompi.

***

### sellerDestinationSpk

> **sellerDestinationSpk**: `string`

Defined in: packages/sdk/src/escrow-core/types.ts:18

Script public key (without version) the release pays.

***

### version?

> `optional` **version?**: [`EscrowVersion`](../type-aliases/EscrowVersion.md)

Defined in: packages/sdk/src/escrow-core/types.ts:23

Contract version: "v2" (default) or "v1" (legacy).
