# The PSKT Authority Lifecycle

The PSKT lifecycle maps exactly to how cryptographic authority is accumulated and satisfied.

## 1. Creation (`pskt export`)
**State:** `Unsigned Transaction`
* A Coordinator (like HardKAS) generates a `plan.json`.
* The Coordinator exports the plan into a PSKT session.
* **New Authority/Evidence:** None. The PSKT merely declares the *Intent* to spend and the UTXO metadata required to validate the spending conditions.

## 2. Partial Signing (`pskt sign`)
**State:** `Partially Signed`
* The PSKT is loaded by a Signer.
* The Signer inspects the PSKT to see which inputs match keys they possess.
* The Signer attaches their cryptographic signature to the PSKT for those specific inputs.
* **New Authority/Evidence:** Cryptographic proof that a specific private key authorized specific inputs. 

*Critical Concept:* Signing a PSKT mutates its internal state, adding partial signatures. It does not extract a final transaction.

## 3. Combination (`pskt merge`)
**State:** `Partially Signed` (Aggregated)
* If multiple signers signed copies of the same original PSKT, their outputs must be combined.
* HardKAS delegates to the upstream Kaspa Combiner to merge the partial signatures into a single PSKT envelope.
* **New Authority/Evidence:** None inherently, but previously isolated authorities are now consolidated in one artifact.

## 4. Finalization (`pskt finalize`)
**State:** `Finalized`
* The Finalizer examines the aggregated PSKT.
* It checks the spending condition (script) for *every single input*.
* It verifies that the accumulated partial signatures satisfy the required authority.
* **New Authority/Evidence:** Proof of Completeness. The Finalizer asserts that all required signatures are present and valid according to the upstream Kaspa script rules.

## 5. Extraction (`pskt extract`)
**State:** `Extracted Signed Transaction`
* Once a PSKT is finalized, it can be extracted.
* The Extractor strips away all the PSKT metadata (UTXO values, derivations) and produces a raw, network-ready Kaspa serialized transaction.
* **New Authority/Evidence:** A valid Kaspa `txId` is generated. The transaction is now in the exact format required by the Kaspa P2P network.

## 6. Submission (`tx send`)
**State:** `Submitted` / `Accepted`
* The extracted transaction is submitted to a node's mempool via RPC.
* **New Authority/Evidence:** Node Acceptance (represented by a HardKAS `receipt.json`).
