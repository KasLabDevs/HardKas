# PSKT Security & Privacy Model

When dealing with PSKTs, the security boundaries shift from local execution to distributed trust.

## Input Ownership & Authority

> **Canonical Invariant:** A signer possessing a key does not imply authority over every PSKT input. Authority derives strictly from the spending condition of each individual input.

When you run `hardkas pskt sign`, the upstream Kaspa logic evaluates the PSKT metadata. It identifies which inputs match the provided key material. It **only** signs those inputs. It does not blanket-sign the entire transaction unless the key controls all inputs.

## Privacy Warning

A common misconception is that because PSKTs do not contain Private Keys, they are perfectly secret. **This is false.**

A PSKT file (`.pskt`) inherently leaks:
* The exact Kaspa Addresses involved.
* The amounts being transferred.
* The UTXOs (outpoints) being spent.
* The Public Keys of the signers (once partial signatures are attached).
* Any complex redeem scripts or covenants.

Treat PSKT files as sensitive financial metadata. While they cannot be used to steal funds (without the private key), they completely expose the financial intent of the transaction.

## Tampering & Integrity

What happens if a malicious Coordinator alters a PSKT before giving it to a Signer?

1. **Changing Amounts or Recipients:** If the Coordinator changes an output, the transaction hash changes. Any signatures produced will commit to the *new* hash. The Signer *must* inspect the PSKT (`hardkas pskt inspect`) to verify the outputs before signing.
2. **Changing Inputs:** If an input is changed, the Signer's signature will commit to the new input set.
3. **Artifact Integrity:** HardKAS hashes the PSKT payload (`payloadHash`). This is an *artifact integrity check*, not a cryptographic transaction check. Modifying the PSKT legitimately (by adding a signature) inherently changes the artifact hash.

**Signer Trust Model:** The Signer does not need network access (they can be offline), but they **must trust their local inspection tool**. They must independently verify the PSKT outputs before signing, as the Coordinator could have handed them a maliciously constructed PSKT.

## Air-gap vs Offline

* **Offline Signing:** The machine signing the PSKT has no internet connection, but might still transfer the file via local network, Bluetooth, or SD card.
* **Air-gapped Signing:** The machine has zero physical or wireless connection to any network. PSKT is specifically designed to support air-gapped workflows, as all required metadata (UTXO scripts and amounts) travels inside the PSKT envelope itself. The signer does not need an RPC connection to validate what they are signing.
