[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyArtifactOnNetwork

# Function: verifyArtifactOnNetwork()

> **verifyArtifactOnNetwork**(`input`): `Promise`\<[`ArtifactNetworkVerification`](../interfaces/ArtifactNetworkVerification.md)\>

Defined in: [packages/sdk/src/artifact-network-verify.ts:281](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L281)

One look at the node for the artifact's transaction, never persisted, never sending anything. `node` is the identity
the caller established for `subject.networkId` (a rusty-kaspad, proven by container or endpoint); anything else is
NOT_CHECKED. The caller has already refused mainnet; this refuses it again (nothing is asked).

## Parameters

### input

#### addressLookup?

[`ArtifactAddressLookupRequest`](../interfaces/ArtifactAddressLookupRequest.md)

R3-D: find the acceptance first through the history of an address the transaction pays or spends from.

#### client

`KaspaRpcClient`

#### maxBatches?

`number`

#### node

`NetworkIdentity`

#### policy?

`TxStatusPolicy`

#### since?

`string`

A virtual-chain cursor: a chain block the node holds that precedes the acceptance (default: the artifact's own).

#### subject

[`ArtifactNetworkSubject`](../interfaces/ArtifactNetworkSubject.md)

## Returns

`Promise`\<[`ArtifactNetworkVerification`](../interfaces/ArtifactNetworkVerification.md)\>
