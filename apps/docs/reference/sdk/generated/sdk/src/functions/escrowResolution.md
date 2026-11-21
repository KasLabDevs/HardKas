[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowResolution

# Function: escrowResolution()

> **escrowResolution**(`config`, `branch`, `options?`): [`EscrowResolution`](../interfaces/EscrowResolution.md)

Defined in: packages/sdk/src/escrow-core/resolution.ts:30

The arguments and the outputs a branch of the escrow `config` describes must have. The config is read by
escrowTermsOf, as createEscrow reads it to compile the contract (C-10): no `version` is v2 (EscrowFull, or EscrowSplit
with both split amounts), a legacy v1 escrow says `version: "v1"`; a v2 full config without `principal` whose two
legacy amounts differ is ESCROW_CONFIG_INVALID here as it is at creation.

## Parameters

### config

[`EscrowConfig`](../interfaces/EscrowConfig.md)

### branch

[`EscrowBranch`](../type-aliases/EscrowBranch.md)

### options?

[`EscrowResolutionOptions`](../interfaces/EscrowResolutionOptions.md)

## Returns

[`EscrowResolution`](../interfaces/EscrowResolution.md)
