# Accounts

HardKAS distinguishes between key storage and network addresses.

- **Simulated Accounts**: Stored in `.hardkas/localnet.json`. These are deterministic seeds used purely for testing.
- **Real Accounts**: Stored in `.hardkas/accounts.real.json`. 
- **Encrypted Keystores**: Standard AES-GCM encrypted JSON files that require a password prompt before the Signer can extract the primitive key material.

## Key Lifecycle
Keys are lazily loaded. When you run `hardkas tx plan`, the private key is **not** loaded from disk. The key is only decrypted and loaded into memory during the exact millisecond the `kaspa-wasm` sighash function is invoked.
