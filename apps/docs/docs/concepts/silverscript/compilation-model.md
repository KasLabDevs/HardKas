# The Compilation & Provenance Model

> **SilverScript:** OFFICIAL RELEASE v1.0.0

Because Kaspa nodes only validate compiled Kaspa Script, anyone interacting with a SilverScript covenant must trust that the compiled byte-code accurately reflects the high-level source code.

This introduces **Compiler Trust**.

## Artifact Provenance in HardKAS

When you run `hardkas silver compile Contract.sil --out record.json`, HardKAS does not just save the compiled script. It generates a comprehensive provenance record.

A HardKAS SilverScript Artifact typically tracks:
* **Source Hash:** The SHA-256 digest of your `.sil` source file.
* **Compiler Version:** The exact version of `silverc` used (e.g., `v1.0.0`).
* **Constructor Arguments Hash:** A digest of any initialization arguments provided.
* **Compiled Script Hash:** The resulting Kaspa Script payload.

*Security Invariant:* HardKAS records hold identities and digests. They do NOT contain the raw constructor arguments or signatures inside the artifact digest loop.

## Reproducibility (`silver verify`)

Because the compiler is deterministic, anyone can verify a deployment. 

If you are handed a `deploy-record`, you can run `hardkas silver verify <record>`. HardKAS will take the original source file, run it through the exact managed compiler version recorded in the artifact, and assert that the resulting Kaspa Script matches byte-for-byte.

## Deployment vs Execution

Do not import Ethereum semantics into Kaspa. 

* **Deploying** a SilverScript contract on Kaspa simply means constructing and broadcasting a transaction that creates the Genesis UTXO (P2SH) holding the initial covenant state.
* **Deployed** does NOT mean there is an "executing service" sitting on the blockchain. It merely means a UTXO exists with those spending constraints.

