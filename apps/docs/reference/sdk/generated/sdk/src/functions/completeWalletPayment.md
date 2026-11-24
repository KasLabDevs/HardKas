[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / completeWalletPayment

# Function: completeWalletPayment()

> **completeWalletPayment**(`sdk`, `input`): `Promise`\<\{ `check`: [`WalletSignatureCheck`](../interfaces/WalletSignatureCheck.md); `signed`: [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md); `txId`: `string`; \}\>

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:215](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L215)

Completes a wallet-signed payment: the request must be the plan's (rebuilt now), what the wallet returned is checked
in full, and the plan is signed through `sdk.tx.sign` with the wallet's signature scripts (the signed artifact stored).
Nothing is sent: send the result with `sdk.tx.send`.

## Parameters

### sdk

[`Hardkas`](../classes/Hardkas.md)

### input

#### plan

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

#### request

[`WalletSignRequest`](../interfaces/WalletSignRequest.md)

#### returned

`unknown`

## Returns

`Promise`\<\{ `check`: [`WalletSignatureCheck`](../interfaces/WalletSignatureCheck.md); `signed`: [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md); `txId`: `string`; \}\>
