[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / notCheckedNetworkVerification

# Function: notCheckedNetworkVerification()

> **notCheckedNetworkVerification**(`reason`, `message`, `options?`): [`ArtifactNetworkVerification`](../interfaces/ArtifactNetworkVerification.md)

Defined in: [packages/sdk/src/artifact-network-verify.ts:241](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L241)

The verification of an artifact that no node was asked about (offline, mainnet, simulated, no endpoint...).

## Parameters

### reason

[`ArtifactNetworkReason`](../type-aliases/ArtifactNetworkReason.md)

### message

`string`

### options?

#### node?

`NetworkIdentity`

#### policy?

`TxStatusPolicy`

## Returns

[`ArtifactNetworkVerification`](../interfaces/ArtifactNetworkVerification.md)
