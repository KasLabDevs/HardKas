[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / signTxPlanArtifact

# Function: signTxPlanArtifact()

> **signTxPlanArtifact**(`input`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: packages/accounts/dist/index.d.ts:234

Main entry point for signing transaction plan artifacts.

## Parameters

### input

#### account?

`HardkasAccount`

#### allowMainnet?

`boolean`

**Deprecated**

HK-12: has no effect. Mainnet signing is decided by @hardkas/core `MAINNET_TRANSACTIONS_ENABLED` (false
in this release line) on every route, a direct library call included (MAINNET_SIGNING_DISABLED).

#### authorizers?

`Readonly`\<`Record`\<`number`, [`TxInputAuthorizer`](../interfaces/TxInputAuthorizer.md)\>\>

#### config?

`HardkasConfig`

#### keystorePassword?

`string`

The password of the account's keystore, in memory only: never stored, logged or echoed.

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
