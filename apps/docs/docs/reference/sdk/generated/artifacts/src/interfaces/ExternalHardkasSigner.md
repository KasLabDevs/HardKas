[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ExternalHardkasSigner

# Interface: ExternalHardkasSigner

Defined in: [packages/artifacts/src/signer.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/signer.ts#L9)

Interface for external wallets and signers.
HardKAS uses this to delegate transaction signing to secure enclaves,
hardware wallets, or official Kaspa SDK backends, ensuring it does not
need to hold or manage private keys natively.

## Methods

### getAddress()

> **getAddress**(): `Promise`\<`string`\>

Defined in: [packages/artifacts/src/signer.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/signer.ts#L13)

Retrieves the public Kaspa address managed by this signer.

#### Returns

`Promise`\<`string`\>

***

### signTransaction()

> **signTransaction**(`txPlan`): `Promise`\<[`SignedTxArtifact`](SignedTxArtifact.md)\>

Defined in: [packages/artifacts/src/signer.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/signer.ts#L20)

Signs a prepared transaction plan.

#### Parameters

##### txPlan

[`TxPlanArtifact`](TxPlanArtifact.md)

The transaction plan artifact to sign.

#### Returns

`Promise`\<[`SignedTxArtifact`](SignedTxArtifact.md)\>

A signed transaction artifact.
