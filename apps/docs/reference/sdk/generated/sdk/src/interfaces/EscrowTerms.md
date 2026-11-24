[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowTerms

# Interface: EscrowTerms

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:86

C-10 · what an escrow config means: its contract version, its mode and the amounts its branches pay. The ONE reading
of a config, used by createEscrow (what is compiled) and escrowResolution (what each branch must pay), so the two can
never disagree:
 - version: `config.version`, else "v2" (EscrowFull or EscrowSplit); a legacy v1 escrow says `version: "v1"`;
 - mode (v2): `config.mode`, else "split" when both buyerAmount and sellerAmount are given, else "full";
 - v1: refundAmount and releaseAmount, each paid by its own branch;
 - v2 split: buyerAmount (else refundAmount) and sellerAmount (else releaseAmount);
 - v2 full: ONE principal. `principal`, when given, is it (legacy amounts next to it are not read). Without it, the
   legacy refundAmount and releaseAmount name it, and when both are given they must be the same amount: different
   ones are ESCROW_CONFIG_INVALID (an EscrowFull compiled with one of them could never pay the other).
Every amount is a positive integer (ESCROW_CONFIG_INVALID otherwise).

## Properties

### buyerAmount?

> `readonly` `optional` **buyerAmount?**: `bigint`

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:94

v2 split: the buyer's allocation.

***

### mode

> `readonly` **mode**: [`EscrowMode`](../type-aliases/EscrowMode.md)

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:88

***

### principal?

> `readonly` `optional` **principal?**: `bigint`

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:98

v2 full: the principal every branch pays.

***

### refundAmount?

> `readonly` `optional` **refundAmount?**: `bigint`

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:90

v1: what refundBuyer pays the buyer.

***

### releaseAmount?

> `readonly` `optional` **releaseAmount?**: `bigint`

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:92

v1: what releaseToSeller pays the seller.

***

### sellerAmount?

> `readonly` `optional` **sellerAmount?**: `bigint`

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:96

v2 split: the seller's allocation.

***

### version

> `readonly` **version**: [`EscrowVersion`](../type-aliases/EscrowVersion.md)

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:87
