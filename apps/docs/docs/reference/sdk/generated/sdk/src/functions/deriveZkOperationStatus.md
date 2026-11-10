[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / deriveZkOperationStatus

# Function: deriveZkOperationStatus()

> **deriveZkOperationStatus**(`params`): [`ZkOperationStatusResult`](../interfaces/ZkOperationStatusResult.md)

Defined in: [packages/artifacts/dist/index.d.ts:14482](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L14482)

Pure function deriving end-to-end ZK operation lifecycle state from
cryptographic facts and L1 transaction confirmation status.
Distinguishes local mathematical proof verification from consensus settlement.

The transaction status, when known, takes precedence: an accepted spend means the node's
OpZkPrecompile verified the proof, whatever was (or was not) checked off-chain. Without a transaction
status, an off-chain verification that was never performed is PROOF_NOT_VERIFIED_OFFCHAIN (not final),
never a definitive failure (HK-17). Only consensus finality is final.

## Parameters

### params

#### txStatus?

`DerivedTxStatus`

#### zkFact

\{ `computeBudget`: `number`; `contentHash?`: `string`; `curve`: `"BN254"`; `draftArtifactId?`: `string`; `feeSompi`: `string`; `guestSystem`: `"custom"` \| `"RISC Zero"`; `hardkasVersion`: `string`; `hashVersion`: `string` \| `number`; `imageId`: `string`; `journalHash`: `string`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `offChainVerification?`: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`; `offChainVerifier?`: `string`; `p2shAddress`: `string`; `payoutAddress`: `string`; `payoutSompi`: `string`; `planArtifactId?`: `string`; `proofSha256`: `string`; `provingSystem`: `"Groth16"`; `redeemScriptHash`: `string`; `schema`: `"hardkas.zkVerificationFact.v1"`; `spendUtxo`: \{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}; `timestamp?`: `string`; `txId`: `string`; `verifiedOffChain`: `boolean`; \}

#### zkFact.computeBudget

`number`

#### zkFact.contentHash?

`string`

#### zkFact.curve

`"BN254"`

#### zkFact.draftArtifactId?

`string`

#### zkFact.feeSompi

`string`

#### zkFact.guestSystem

`"custom"` \| `"RISC Zero"`

#### zkFact.hardkasVersion

`string`

#### zkFact.hashVersion

`string` \| `number`

#### zkFact.imageId

`string`

#### zkFact.journalHash

`string`

#### zkFact.networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

#### zkFact.offChainVerification?

`"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

#### zkFact.offChainVerifier?

`string`

#### zkFact.p2shAddress

`string`

#### zkFact.payoutAddress

`string`

#### zkFact.payoutSompi

`string`

#### zkFact.planArtifactId?

`string`

#### zkFact.proofSha256

`string`

#### zkFact.provingSystem

`"Groth16"`

#### zkFact.redeemScriptHash

`string`

#### zkFact.schema

`"hardkas.zkVerificationFact.v1"`

#### zkFact.spendUtxo

\{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}

#### zkFact.spendUtxo.amountSompi

`string`

#### zkFact.spendUtxo.index

`number`

#### zkFact.spendUtxo.transactionId

`string`

#### zkFact.timestamp?

`string`

#### zkFact.txId

`string`

#### zkFact.verifiedOffChain

`boolean`

## Returns

[`ZkOperationStatusResult`](../interfaces/ZkOperationStatusResult.md)
