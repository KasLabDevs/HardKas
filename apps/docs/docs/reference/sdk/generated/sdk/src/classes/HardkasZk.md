[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasZk

# Class: HardkasZk

Defined in: [packages/sdk/src/zk.ts:371](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L371)

## Constructors

### Constructor

> **new HardkasZk**(`sdk`): `HardkasZk`

Defined in: [packages/sdk/src/zk.ts:396](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L396)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasZk`

## Properties

### corpus

> `readonly` **corpus**: `object`

Defined in: [packages/sdk/src/zk.ts:380](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L380)

#### verify

> **verify**: (`targetPath`) => `Promise`\<[`ZkCorpusVerifyResult`](../interfaces/ZkCorpusVerifyResult.md)\>

##### Parameters

###### targetPath

`string`

##### Returns

`Promise`\<[`ZkCorpusVerifyResult`](../interfaces/ZkCorpusVerifyResult.md)\>

***

### proof

> `readonly` **proof**: `object`

Defined in: [packages/sdk/src/zk.ts:372](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L372)

#### inspect

> **inspect**: (`targetPath`) => `Promise`\<[`ZkProofInspectResult`](../interfaces/ZkProofInspectResult.md)\>

##### Parameters

###### targetPath

`string`

##### Returns

`Promise`\<[`ZkProofInspectResult`](../interfaces/ZkProofInspectResult.md)\>

#### verifyLocal

> **verifyLocal**: (`targetPath`) => `Promise`\<[`ZkProofVerifyResult`](../interfaces/ZkProofVerifyResult.md)\>

##### Parameters

###### targetPath

`string`

##### Returns

`Promise`\<[`ZkProofVerifyResult`](../interfaces/ZkProofVerifyResult.md)\>

#### verifyMath

> **verifyMath**: (`targetPath`, `options?`) => `Promise`\<[`ZkProofMathVerifyResult`](../interfaces/ZkProofMathVerifyResult.md)\>

##### Parameters

###### targetPath

`string`

###### options?

[`ZkProofMathOptions`](../interfaces/ZkProofMathOptions.md)

##### Returns

`Promise`\<[`ZkProofMathVerifyResult`](../interfaces/ZkProofMathVerifyResult.md)\>

***

### toccata

> `readonly` **toccata**: `object`

Defined in: [packages/sdk/src/zk.ts:383](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L383)

#### buildPlan

> **buildPlan**: (`params`) => [`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

Builds a TxPlanArtifact (hardkas.txPlan.v1) for a Toccata ZK Groth16 spend.
Integrates ZK transactions directly into HardKAS's deterministic plan pipeline. The estimated mass is
measured for the real shape with kaspa-wasm (ZK-08), never the 1602 reference constant. Throws
`ZK_P2SH_ADDRESS_UNAVAILABLE` when the scripts carry no address for the plan's network (no placeholder).

##### Parameters

###### params

[`BuildR0Groth16TxParams`](../interfaces/BuildR0Groth16TxParams.md)

##### Returns

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

#### buildScripts

> **buildScripts**: (`params`) => [`R0Groth16ScriptsResult`](../interfaces/R0Groth16ScriptsResult.md)

Builds the Kaspa Toccata P2SH redeem script (locking) and signature script (unlocking) for a
RISC Zero Groth16 receipt, through kaspa-wasm's ZkScriptBuilder (upstream minimal flow:
commitToGroth16(imageId) + finalizeWithGroth16Proof(receipt, journalHash)).

Authorization model, proof-only (the default; HK-16, by upstream design): the lock binds the image id only.
"Whoever holds a valid receipt of that program spends." The journal is supplied by the unlocking script;
outputs, outpoint and network are not bound, so replay across UTXOs/networks and front-running of a mempool
spend are properties of the design. Every result carries the warning ZK_LOCK_BINDS_IMAGE_ID_ONLY.

proof-and-output-bound (`bindingPolicy`): after the Groth16 verifier, the redeem script checks by output
introspection the output count and the payout's (and change's) script public key and amount, then requires exactly
one input and an input of at most the bound outputs plus `maxFeeSompi`. A valid receipt can only send the funds to
those outputs. The spent outpoint is never bound (circular: `utxoBinding` is refused). The bound script public key is
the version-prefixed encoding OpTxOutputSpk pushes. Results carry ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS.

Addresses: the simnet address is always returned. testnet-10/mainnet addresses are returned only when
requested in `addressNetworks` (proof-only also needs `acknowledgeImageIdOnlyLock: true`), and never for a
public test vector.

Receipt cross-check (HK-19): when the receipt carries its claim pruned to a digest (the usual Borsh
encoding), the digest is recomputed from (imageId, journalHash) and a mismatch is rejected
(ZK_RECEIPT_CLAIM_MISMATCH): a wrong image id would lock funds to a program with no such receipt, a wrong
journal would make the unlocking script fail.

##### Parameters

###### params

[`R0Groth16ScriptParams`](../interfaces/R0Groth16ScriptParams.md)

##### Returns

[`R0Groth16ScriptsResult`](../interfaces/R0Groth16ScriptsResult.md)

#### buildTransaction

> **buildTransaction**: (`params`) => [`R0Groth16TxResult`](../interfaces/R0Groth16TxResult.md)

Builds (does not sign or broadcast) a version-1 transaction spending a P2SH UTXO locked by a
RISC Zero Groth16 lock. The compute budget must be a u16 that covers the precompile (tag cost + 250,000
script units per VK element + the observed script overhead; ZK-07) and whose compute mass fits a block;
the fee is derived from the mass kaspa-wasm reports for the real transaction plus the compute-budget term.
Every result carries the lock's authorization-model warning (ZK_LOCK_BINDS_IMAGE_ID_ONLY, HK-16, or
ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS); public networks are refused for public vectors. In proof-and-output-bound
mode the outputs are exactly the bound ones and the fee is what the UTXO holds beyond them; any fee above the cap
(feeOptions.maxFeeSompi, default DEFAULT_MAX_FEE_CAP_SOMPI) is refused (ZK_FEE_ABOVE_CAP).
The emitted ZK fact records the real image id, the SHA-256 of the proof BYTES, no placeholder and no
clock (HK-20); verifiedOffChain is true only with a genuine verifyR0Groth16ReceiptLocal result (HK-17).

##### Parameters

###### params

[`BuildR0Groth16TxParams`](../interfaces/BuildR0Groth16TxParams.md)

##### Returns

[`R0Groth16TxResult`](../interfaces/R0Groth16TxResult.md)

#### createJournal

> **createJournal**: (`params`) => [`ZkJournalBindingResult`](../interfaces/ZkJournalBindingResult.md)

Creates a canonical, domain-separated journal for zkVM applications committing to transaction outputs.
Domain: HARDKAS_ZK_OUTPUT_BINDING_V1
Layout: [0..4] "HKZ1" | [4..36] SPK SHA-256 | [36..44] Amount u64 LE | [44..76] Outpoint Digest | [76..108] Nonce

OFF-CHAIN CONVENTION ONLY: no HardKAS lock checks this journal. The redeem scripts verify a receipt of the image id
for whatever journal hash the spender supplies; the outputs are bound by introspection in proof-and-output-bound
mode, not through the journal. The fields mean something only if the guest program enforces them.

##### Parameters

###### params

[`ZkJournalBindingParams`](../interfaces/ZkJournalBindingParams.md)

##### Returns

[`ZkJournalBindingResult`](../interfaces/ZkJournalBindingResult.md)

#### deriveStatus

> **deriveStatus**: (`params`) => [`ZkOperationStatusResult`](../interfaces/ZkOperationStatusResult.md)

Pure function deriving end-to-end ZK operation lifecycle state from
cryptographic facts and L1 transaction confirmation status.
Distinguishes local mathematical proof verification from consensus settlement.

The transaction status, when known, takes precedence: an accepted spend means the node's
OpZkPrecompile verified the proof, whatever was (or was not) checked off-chain. Without a transaction
status, an off-chain verification that was never performed is PROOF_NOT_VERIFIED_OFFCHAIN (not final),
never a definitive failure (HK-17). Only consensus finality is final.

##### Parameters

###### params

###### txStatus?

`DerivedTxStatus`

###### zkFact

\{ `computeBudget`: `number`; `contentHash?`: `string`; `curve`: `"BN254"`; `draftArtifactId?`: `string`; `feeSompi`: `string`; `guestSystem`: `"custom"` \| `"RISC Zero"`; `hardkasVersion`: `string`; `hashVersion`: `string` \| `number`; `imageId`: `string`; `journalHash`: `string`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `offChainVerification?`: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`; `offChainVerifier?`: `string`; `p2shAddress`: `string`; `payoutAddress`: `string`; `payoutSompi`: `string`; `planArtifactId?`: `string`; `proofSha256`: `string`; `provingSystem`: `"Groth16"`; `redeemScriptHash`: `string`; `schema`: `"hardkas.zkVerificationFact.v1"`; `spendUtxo`: \{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}; `timestamp?`: `string`; `txId`: `string`; `verifiedOffChain`: `boolean`; \}

###### zkFact.computeBudget

`number`

###### zkFact.contentHash?

`string`

###### zkFact.curve

`"BN254"`

###### zkFact.draftArtifactId?

`string`

###### zkFact.feeSompi

`string`

###### zkFact.guestSystem

`"custom"` \| `"RISC Zero"`

###### zkFact.hardkasVersion

`string`

###### zkFact.hashVersion

`string` \| `number`

###### zkFact.imageId

`string`

###### zkFact.journalHash

`string`

###### zkFact.networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

###### zkFact.offChainVerification?

`"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

###### zkFact.offChainVerifier?

`string`

###### zkFact.p2shAddress

`string`

###### zkFact.payoutAddress

`string`

###### zkFact.payoutSompi

`string`

###### zkFact.planArtifactId?

`string`

###### zkFact.proofSha256

`string`

###### zkFact.provingSystem

`"Groth16"`

###### zkFact.redeemScriptHash

`string`

###### zkFact.schema

`"hardkas.zkVerificationFact.v1"`

###### zkFact.spendUtxo

\{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}

###### zkFact.spendUtxo.amountSompi

`string`

###### zkFact.spendUtxo.index

`number`

###### zkFact.spendUtxo.transactionId

`string`

###### zkFact.timestamp?

`string`

###### zkFact.txId

`string`

###### zkFact.verifiedOffChain

`boolean`

##### Returns

[`ZkOperationStatusResult`](../interfaces/ZkOperationStatusResult.md)

#### observeSpendOnce

> **observeSpendOnce**: (`txId`, `zkFact?`) => `Promise`\<\{ `derivedStatus`: `any`; `observation`: `any`; `zkStatus?`: `any`; \}\>

##### Parameters

###### txId

`string`

###### zkFact?

###### computeBudget

`number`

###### contentHash?

`string`

###### curve

`"BN254"`

###### draftArtifactId?

`string`

###### feeSompi

`string`

###### guestSystem

`"custom"` \| `"RISC Zero"`

###### hardkasVersion

`string`

###### hashVersion

`string` \| `number`

###### imageId

`string`

###### journalHash

`string`

###### networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

###### offChainVerification?

`"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

###### offChainVerifier?

`string`

###### p2shAddress

`string`

###### payoutAddress

`string`

###### payoutSompi

`string`

###### planArtifactId?

`string`

###### proofSha256

`string`

###### provingSystem

`"Groth16"`

###### redeemScriptHash

`string`

###### schema

`"hardkas.zkVerificationFact.v1"`

###### spendUtxo

\{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}

###### spendUtxo.amountSompi

`string`

###### spendUtxo.index

`number`

###### spendUtxo.transactionId

`string`

###### timestamp?

`string`

###### txId

`string`

###### verifiedOffChain

`boolean`

##### Returns

`Promise`\<\{ `derivedStatus`: `any`; `observation`: `any`; `zkStatus?`: `any`; \}\>

#### prepareProof

> **prepareProof**: (`receiptHex`) => `string`

Extracts and compresses the Groth16 proof (128 bytes = 256 hex chars)
from a RISC Zero Borsh-encoded receipt using the pinned kaspa-wasm.

##### Parameters

###### receiptHex

`string`

##### Returns

`string`

#### rules

> **rules**: () => [`ToccataPrecompileRules`](../interfaces/ToccataPrecompileRules.md)

The consensus / pricing facts HardKAS relies on, with their upstream sources.

##### Returns

[`ToccataPrecompileRules`](../interfaces/ToccataPrecompileRules.md)

#### verifyReceipt

> **verifyReceipt**: (`params`) => `Promise`\<[`R0Groth16LocalVerificationResult`](../interfaces/R0Groth16LocalVerificationResult.md)\>

Verifies a RISC Zero Groth16 receipt locally: recomputes the claim digest from (imageId, journalHash),
derives the five public inputs with the pinned control root / BN254 control id, decodes the seal and runs
the snarkjs pairing against the pinned RISC Zero verifying key (anchored: PINNED_REGISTRY). A VERIFIED
result means "a valid RISC Zero Groth16 proof exists for this program and journal". It says nothing about
what the guest program does, and it is not on-chain acceptance (the node decides; the off-chain and
on-chain verifiers are different implementations: snarkjs vs arkworks).

##### Parameters

###### params

###### imageId

`string`

###### journalHash

`string`

###### receiptHex

`string`

###### timeoutMs?

`number`

##### Returns

`Promise`\<[`R0Groth16LocalVerificationResult`](../interfaces/R0Groth16LocalVerificationResult.md)\>

#### verifyScripts

> **verifyScripts**: (`params`) => [`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)

Structural verification of RISC Zero Groth16 redeem and signature scripts by opcode parsing
(audit M-03 replaced the substring heuristics). It proves shape, not spendability: only the node
runs the precompile.

##### Parameters

###### params

[`R0Groth16VerifyScriptsParams`](../interfaces/R0Groth16VerifyScriptsParams.md)

##### Returns

[`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)

## Methods

### capabilities()

> **capabilities**(): `Promise`\<[`ZkCapabilities`](../interfaces/ZkCapabilities.md)\>

Defined in: [packages/sdk/src/zk.ts:426](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L426)

#### Returns

`Promise`\<[`ZkCapabilities`](../interfaces/ZkCapabilities.md)\>
