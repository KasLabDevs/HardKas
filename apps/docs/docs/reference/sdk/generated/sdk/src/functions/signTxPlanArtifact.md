[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / signTxPlanArtifact

# Function: signTxPlanArtifact()

> **signTxPlanArtifact**(`input`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: packages/accounts/dist/index.d.ts:194

Main entry point for signing transaction plan artifacts.

## Parameters

### input

#### account?

`HardkasAccount`

#### allowMainnet?

`boolean`

#### authorizers?

`Readonly`\<`Record`\<`number`, [`TxInputAuthorizer`](../interfaces/TxInputAuthorizer.md)\>\>

#### config?

`HardkasConfig`

#### planArtifact

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

#### target

\{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `network`: `string`; \}

#### target.domain

`"kaspa-l1"` \| `"evm-l2"`

#### target.mode

`"rpc"` \| `"simulator"` \| `"localnet"`

#### target.network

`string`

## Returns

`Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>
