[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasZk

# Class: HardkasZk

Defined in: [packages/sdk/src/zk.ts:380](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L380)

## Constructors

### Constructor

> **new HardkasZk**(`sdk`): `HardkasZk`

Defined in: [packages/sdk/src/zk.ts:407](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L407)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasZk`

## Properties

### corpus

> `readonly` **corpus**: `object`

Defined in: [packages/sdk/src/zk.ts:389](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L389)

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

Defined in: [packages/sdk/src/zk.ts:381](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L381)

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

Defined in: [packages/sdk/src/zk.ts:392](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L392)

#### buildPlan

> **buildPlan**: (`params`) => [`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

Builds a TxPlanArtifact (hardkas.txPlan.v1) for a Toccata ZK Groth16 spend.
Integrates ZK transactions directly into HardKAS's deterministic plan pipeline. The estimated mass is
measured for the real shape with kaspa-wasm (ZK-08), never the 1602 reference constant. Throws
`ZK_P2SH_ADDRESS_UNAVAILABLE` when the scripts carry no address for the plan's network (no placeholder), and
`MAINNET_SIGNING_DISABLED` for mainnet, before anything is read (see buildR0Groth16Transaction).

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

Storage mass (G1): the spend of an output-bound lock is measured as it will be funded (one input of
requiredFundingSompi, the bound outputs, the default compute budget; fee never below the node's relay floor). If its
storage mass (KIP-9, C/output - C/input) is above BLOCK_STORAGE_MASS_LIMIT, which a small payout or change causes, no
node will ever include it: the lock is refused (ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT, nothing built) with the
smallest amounts that fit (minimumBoundAmountsSompi). Storage mass grows with the amount funded; when a UTXO within the
lock's input limit would exceed it, the warning ZK_BOUND_LOCK_OVERFUNDING_UNSPENDABLE says from which amount.

Addresses: the simnet address is always returned. A testnet-10 address is returned only when requested in
`addressNetworks` (proof-only also needs `acknowledgeImageIdOnlyLock: true`), and never for a proof-only lock of a
public test program (its image id is in PUBLIC_R0_TEST_VECTORS); an output-bound lock of one is built with the warning
ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE (C-1).

Mainnet (MAINNET TOTAL LOCKDOWN, P37): a lock's signature script IS the authorization of its spend (a ZK spend
carries no signature), so no lock is built for mainnet. A mainnet entry in `addressNetworks`, in any spelling
(`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case), or a bound payout or change address of mainnet
(`kaspa:`) throws MAINNET_SIGNING_DISABLED before the receipt is read: no mainnet P2SH address and no signature script.

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
ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS); a public network is refused for a lock of a public test program unless its
redeem script really binds the outputs (C-1; then ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE). Whether it does, and so
`consensusEnforced`, is read from the redeem script with verifyR0Groth16Scripts, never from the scripts object's
`bindingMode` label (C-7). In proof-and-output-bound
mode the outputs are exactly the bound ones and the fee is what the UTXO holds beyond them; any fee above the cap
(feeOptions.maxFeeSompi, default DEFAULT_MAX_FEE_CAP_SOMPI) is refused (ZK_FEE_ABOVE_CAP).
G1 · the fee floor is the node's (minimumRelayFeeSompi: v1FeeMass / v1MinimumRelayFee, compute or transient mass, never
storage mass) and the storage mass (storageMass, KIP-9) must fit BLOCK_STORAGE_MASS_LIMIT
(ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT): both are the rusty-kaspad 2.1.0 rules, proven on simnet.
The emitted ZK fact records the real image id, the SHA-256 of the proof BYTES, no placeholder and no
clock (HK-20); verifiedOffChain is true only with a genuine verifyR0Groth16ReceiptLocal result (HK-17).

Mainnet (any spelling: `mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case) throws MAINNET_SIGNING_DISABLED
before anything is read or built (MAINNET TOTAL LOCKDOWN, crypto review H5): a ZK spend carries no signature, its
signature script (journal hash, proof, redeem script) IS the authorization, so the transaction this returns is complete
and any tool could broadcast it. The guard decides from the declared network (a Kaspa transaction does not commit to one).

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

\{ `computeBudget`: `number`; `contentHash?`: `string`; `curve`: `"BN254"`; `draftArtifactId?`: `string`; `feeSompi`: `string`; `guestSystem`: `"custom"` \| `"RISC Zero"`; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `imageId`: `string`; `journalHash`: `string`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `offChainVerification?`: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`; `offChainVerifier?`: `string`; `p2shAddress`: `string`; `payoutAddress`: `string`; `payoutSompi`: `string`; `planArtifactId?`: `string`; `proofSha256`: `string`; `provingSystem`: `"Groth16"`; `redeemScriptHash`: `string`; `schema`: `"hardkas.zkVerificationFact.v1"`; `spendUtxo`: \{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}; `timestamp?`: `string`; `txId`: `string`; `verifiedOffChain`: `boolean`; \}

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

###### zkFact.hashVersion?

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

###### hashVersion?

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

#### spend

> **spend**: (`params`) => `Promise`\<[`ZkSpendResult`](../interfaces/ZkSpendResult.md)\>

ZK-SEND-1 · plans, records and sends a lock's spend through sdk.tx.send (spendR0Groth16Lock).

##### Parameters

###### params

[`ZkSpendParams`](../interfaces/ZkSpendParams.md)

##### Returns

`Promise`\<[`ZkSpendResult`](../interfaces/ZkSpendResult.md)\>

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

Verification of RISC Zero Groth16 redeem and signature scripts. It proves what the scripts ARE, not that they spend:
only the node runs the precompile.
 - Pinned verifier (crypto review H1): the verifying key handed to OpZkPrecompile (the push right before the Groth16
   tag) must be R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX, and the script must push the pinned control root (split
   into its two 16-byte halves) and BN254 control id (risc0 v3.0.4). Any other key is refused even when the script
   pushes the right image id: whoever knows its trapdoor forges receipts (ZK_VERIFYING_KEY_NOT_PINNED,
   ZK_CONTROL_ROOT_NOT_PINNED, ZK_CONTROL_ID_NOT_PINNED).
 - Byte-exact reconstruction (H2): the image id is read from the script's first push and, in output-bound mode, the
   outputs and the input limit from what follows the verifier; the script is then rebuilt with the builders
   buildR0Groth16Scripts uses (kaspa-wasm's verifier fragment, r0BoundRedeemScript) and compared byte for byte. Only
   an identical script is `redeemScriptCanonical`; only a canonical output-bound lock over the pinned verifier, with
   no issue, is `consensusEnforced` and gets its `enforces*` / `bound*` fields. Anything else is
   ZK_REDEEM_SCRIPT_NOT_CANONICAL: nothing is inferred from the presence of opcodes.
 - Expected outputs (payout, change) are compared with what a canonical output-bound lock binds; asked of any other
   script they are ZK_EXPECTED_BINDING_NOT_ENFORCED, never satisfied vacuously.
 - G1 · a canonical output-bound lock whose cheapest spend (one input of the bound outputs plus the node's relay floor at
   the smallest compute budget that covers the verifier) has a storage mass above BLOCK_STORAGE_MASS_LIMIT can never be
   included by any node: ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT (not consensus-enforced, do not fund it).

##### Parameters

###### params

[`R0Groth16VerifyScriptsParams`](../interfaces/R0Groth16VerifyScriptsParams.md)

##### Returns

[`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)

## Methods

### capabilities()

> **capabilities**(): `Promise`\<[`ZkCapabilities`](../interfaces/ZkCapabilities.md)\>

Defined in: [packages/sdk/src/zk.ts:438](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L438)

#### Returns

`Promise`\<[`ZkCapabilities`](../interfaces/ZkCapabilities.md)\>
