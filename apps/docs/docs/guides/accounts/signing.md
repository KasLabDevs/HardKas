# Signing a Transaction

Generating a transaction plan (`plan.json`) is a purely mathematical exercise mapping inputs to outputs. To actually execute the transaction on the network, it must be **Signed**.

## The Signing Lifecycle

1. **Plan Output:** You have a `TxPlanArtifact`.
2. **Authority Check:** HardKAS inspects the inputs in the plan. Which addresses own the UTXOs being spent?
3. **Signer Resolution:** HardKAS attempts to resolve the provided signer alias (e.g., `--account alice`).
4. **Key Retrieval:** HardKAS checks if it has the cryptographic authority to sign for the required addresses.
    * If `kind: "synthetic"`, it bypasses cryptography.
    * If `kind: "kaspa"` (encrypted), it prompts for a password, decrypts the key, signs the transaction, and wipes the key from memory.
    * If `kind: "kaspa"` (plaintext), it signs directly.
5. **Artifact Generation:** HardKAS outputs a `SignedTxArtifact`.

## CLI Example

```bash
hardkas tx sign plan.json --account alice --out signed.json
```

If `alice` does not own the Private Key required for the inputs in `plan.json`, the CLI will throw an error: `HARDKAS_MISSING_AUTHORITY`. 

## Bridging to PSKT

What happens if HardKAS resolves the account and discovers `kind: "external-wallet"`? 

HardKAS knows the address, but it **does not** hold the private key. It cannot sign the transaction locally. 

In this scenario, you cannot use standard signing. Instead, the required authorization is distributed. This is where **Partially Signed Kaspa Transactions (PSKT)** are used. You export the transaction as a PSKT, hand it to the external authority (e.g., a hardware wallet or multisig participant), and they attach the signature.

*See the PSKT documentation (coming next) for advanced distributed signing.*
