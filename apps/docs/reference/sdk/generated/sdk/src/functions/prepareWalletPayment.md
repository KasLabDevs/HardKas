[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / prepareWalletPayment

# Function: prepareWalletPayment()

> **prepareWalletPayment**(`sdk`, `options`): `Promise`\<\{ `plan`: [`TxPlanArtifact`](../interfaces/TxPlanArtifact.md); `request`: [`WalletSignRequest`](../interfaces/WalletSignRequest.md); \}\>

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:180](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L180)

Plans a P2PK payment from a browser wallet's address (`sdk.tx.plan`, stored like any plan once signed) and the request
the page hands the wallet. Nothing is signed; no key is read (HardKAS holds none for the wallet).

## Parameters

### sdk

[`Hardkas`](../classes/Hardkas.md)

### options

[`WalletPaymentOptions`](../interfaces/WalletPaymentOptions.md)

## Returns

`Promise`\<\{ `plan`: [`TxPlanArtifact`](../interfaces/TxPlanArtifact.md); `request`: [`WalletSignRequest`](../interfaces/WalletSignRequest.md); \}\>
