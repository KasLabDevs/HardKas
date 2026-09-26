# The Authority Model

The single most important invariant in HardKAS is this:

> **Authority must be derived from the operation being attempted, not from a generic label assigned to an identity.**

Mixing up *who receives funds*, *who creates funds*, and *who authorizes spending* causes fatal architectural flaws (as proven in Hardening Wave 3/DEF15).

## The Authority Lifecycle

### 1. Funding Authority (Creating Value)
When you run `hardkas localnet fund alice`, who is acting?
* The **Funding Authority** is the Localnet CPU Miner.
* The Miner constructs a coinbase transaction.
* The Miner assigns ownership of the new UTXOs to Alice's address.

*Critical Invariant:* The Miner does **not** gain signing authority over Alice's account just because it funded her. The Miner's authority ends the moment the UTXO is created.

### 2. The Recipient (Receiving Value)
A Recipient is simply an **Address** listed in a transaction's outputs.
* **Can a recipient sign the transaction?** No. Receiving funds does not grant, nor does it require, signing authority over the transaction creating those funds.
* An Address is perfectly valid as a recipient even if HardKAS has absolutely no ability to sign for it (e.g., an `external-wallet` or an exchange address).

### 3. The Signer (Spending Value)
To spend a UTXO, the transaction planner maps the UTXO's script to a required cryptographic signature. 
* The **Signer** is the entity holding the exact Private Key that satisfies that script.
* When HardKAS plans a transaction, it evaluates: *Do I hold the required Signing Authority locally, or must this authorization be deferred?*

---

## Transaction Plan ≠ Authorization to Spend

A `TxPlanArtifact` (`plan.json`) is a deterministic map of Inputs and Outputs.
**Generating a plan requires zero signing authority.**

You can plan a transaction that spends from Satoshi Nakamoto's wallet, and HardKAS will successfully generate a `plan.json` (assuming the UTXOs exist). HardKAS will only fail at the *Signing* phase when it discovers it lacks the authority to produce the required cryptographic signatures.

## Signed Transaction ≠ Node Acceptance

When a Signer successfully signs a plan, it produces a `SignedTxArtifact`. 
This artifact mathematically proves that the required authority was exercised. 

However, **it does not prove the transaction is valid on the network.** The node may still reject it due to:
* The UTXO having been spent in the mempool a millisecond ago.
* Network fee rules changing.
* Time-locks (maturity) not being met yet.

## Node Acceptance ≠ Finality

Even if the node accepts the transaction and returns a `receipt.json` (or TxId), **it is not final.** The block containing the transaction could be orphaned in a DAG reorg. Finality is a spectrum based on accumulated block DAG score, not a boolean state.

---

## Bridging to PSKT (Partially Signed Kaspa Transactions)

Once you understand that **Authority ≠ Identity**, the concept of PSKT becomes obvious.

Normal signing assumes HardKAS has local, synchronous access to the Private Key. 
When it doesn't (because the authority belongs to a cold wallet, a multisig quorum, or an external custodian), HardKAS cannot produce the `SignedTxArtifact` directly. 

Instead, it exports the required authority request as a PSKT. PSKT is simply a protocol for transporting and fulfilling signing authority when it is distributed across different environments.
