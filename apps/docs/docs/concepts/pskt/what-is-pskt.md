# What is PSKT?

PSKT stands for **Partially Signed Kaspa Transactions**.

When HardKAS builds a transaction, it normally attempts to authorize it instantly by resolving a local account (like `alice`) and signing the inputs with its private key. But what happens if HardKAS **does not have the key**?

PSKT solves the problem of **distributed authority**. It is a coordination protocol (and binary format) that allows a Kaspa transaction to be transported between different environments, accumulating signatures along the way, without requiring any participant to have full network access or full authority.

## PSKT is NOT Multisig

Do not conflate these two concepts:
* **PSKT** is a *transport mechanism*. It is the envelope used to carry an unsigned (or partially signed) transaction around.
* **Multisig** is a *spending condition* enforced by Kaspa consensus (e.g., "3 of 5 signatures required").

You can use a PSKT for a perfectly normal, single-signature transaction if you want to sign it on an offline computer. PSKT is simply the container.

## Upstream Integration

HardKAS does not invent its own PSKT format. It delegates directly to the **upstream `rusty-kaspa` PSKT implementation**.

When you run `hardkas pskt combine` or `hardkas pskt finalize`, HardKAS passes the binary payloads directly into the native Kaspa Rust codebase to ensure 100% protocol compatibility.

## The Problem PSKT Solves

PSKT solves three fundamental challenges in Kaspa transaction construction:

1. **Hardware / External Wallets:** You want to construct a transaction on your laptop (which has node access to query UTXOs), but sign it on a Ledger or external signer (which has no network access).
2. **Multi-Party Coordination:** You want to spend from a 2-of-3 multisig address. Alice signs the transaction on her computer and sends it to Bob. Bob adds his signature.
3. **Air-Gapped Security:** You want to construct a transaction on an online machine, transfer it via USB to a completely offline (air-gapped) machine for signing, and bring the signed result back online for broadcasting.

PSKT ensures that all the metadata required to sign the transaction (UTXO scripts, amounts, network details) travels *inside* the PSKT artifact itself, meaning the signer does not need to trust an RPC node.
