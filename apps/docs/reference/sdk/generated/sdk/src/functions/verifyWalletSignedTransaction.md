[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyWalletSignedTransaction

# Function: verifyWalletSignedTransaction()

> **verifyWalletSignedTransaction**(`input`): [`WalletSignatureCheck`](../interfaces/WalletSignatureCheck.md)

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:126](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L126)

The full check of a wallet's signed transaction: what the page checks (the same transaction, every asked input with a
well-formed SIGHASH_ALL signature, nothing else changed) and, per asked input, a valid BIP340 signature by the request's
key over HardKAS's own signature hash of the transaction it built (WALLET_SIGNATURE_INVALID).

## Parameters

### input

#### request

[`WalletSignRequest`](../interfaces/WalletSignRequest.md)

#### returned

`unknown`

#### sighash

\{ `tx`: `KaspaSighashTransaction`; `utxos`: readonly `KaspaSighashUtxo`[]; \}

#### sighash.tx

`KaspaSighashTransaction`

#### sighash.utxos

readonly `KaspaSighashUtxo`[]

## Returns

[`WalletSignatureCheck`](../interfaces/WalletSignatureCheck.md)
