# Transaction v1

> **L1 Status:** ACTIVE CONSENSUS | **SilverScript:** OFFICIAL RELEASE v1.0.0

Toccata introduces a new transaction serialization format (v1). This is required to support Covenants, ZK Proofs, and precise compute pricing.

## The Cryptographic Identity Matrix

A critical mistake when working with Kaspa Covenants is assuming that `txid`, `tx::hash`, and the `sighash` commit to identical data. They do not. 

To safely orchestrate transactions, you must understand exactly what each identifier commits to:

| Field | Commits to `txid`? | Commits to `tx::hash`? | Script-Visible? | Consensus Relevance |
| :--- | :--- | :--- | :--- | :--- |
| **Inputs (Outpoints)** | Yes | Yes | Yes | UTXO consumption |
| **Outputs (Scripts/Amounts)** | Yes | Yes | Yes | UTXO creation |
| **Transaction Version** | Yes | Yes | Yes | Schema validation |
| **Lock Time** | Yes | Yes | Yes | Time locks |
| **Subnetwork ID** | Yes | Yes | Yes | L1/L2 domains |
| **Compute Budget** | **NO** | Yes | **NO** | Replaces `sig_op_count` |
| **Payload / Lane Data** | **NO** | Yes | **NO** | Sequencing & vProgs |
| **Covenant Bindings** | Yes | Yes | Yes | Covenant lineage |

### Why doesn't `txid` commit to `compute_budget`?

By excluding `compute_budget` and the `payload` from the `txid`, Kaspa allows nodes (or PSKT coordinators) to adjust the compute budget or attach sequencing data without altering the topological identity of the transaction in the DAG. 

If you are tracking an artifact in HardKAS, your `artifactId` tracks the logical intent, but the network uses the `txid`.

## Output Covenant Bindings

A v1 transaction output can optionally specify a **Covenant Binding**. This is an index mapping an output to a specific `covenant_id` (managed by consensus). 
* **Do not conflate bindings with the covenant ID itself.** The binding is merely the transaction-level pointer that says "This output belongs to covenant family X."
* The actual state transition logic is still validated by the Kaspa Script inside the output's `scriptPublicKey`.

## HardKAS Support

HardKAS natively supports building and signing v1 transactions.

**Status:** `IMPLEMENTED` / `QUALIFIED`
* The `hardkas tx plan` command automatically upgrades to `v1` when covenant logic or `compute_budget` options are detected.
* The HardKAS PSKT adapter (delegating to upstream `rusty-kaspa` v2.1.0) preserves all v1 metadata, compute budgets, and bindings during offline signing rounds.

