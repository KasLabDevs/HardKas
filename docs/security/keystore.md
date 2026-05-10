# HardKAS Keystore Security

The HardKAS developer keystore is designed for local, first-party developer identity management within the Kaspa ecosystem.

## Security Architecture

- **Key Derivation (KDF)**: Argon2id (via `hash-wasm`).
    - Default: 64MB memory, 3 iterations, 1 parallelism.
    - Argon2id provides strong resistance against GPU and ASIC cracking compared to PBKDF2 or Scrypt.
- **Encryption**: AES-256-GCM.
    - Provides authenticated encryption (AEAD), ensuring that the ciphertext has not been tampered with.
    - A random 16-byte salt is generated for each keystore.
    - A random 12-byte nonce is generated for each encryption operation.
- **Storage**: Keystores are stored as JSON files under `.hardkas/keystore/`.
    - Only the `encryptedPayload` is secret. 
    - Metadata (label, network, address) is stored in plaintext for discoverability.

## Intended Use

- **Local Development**: Managing keys for localnet (simnet) and public testnets.
- **Developer Workflows**: Signing transactions during development, testing, and CI/CD (if secrets are managed correctly).

## Limitations and Warnings

> [!WARNING]
> **NOT FOR INSTITUTIONAL CUSTODY**
> The HardKAS keystore is a developer tool. It is not designed for institutional custody, treasury management, or as a replacement for high-security hardware wallets.

- **Hot Wallet Risk**: Once unlocked in memory, the private key is briefly available to the process. While we attempt best-effort zeroization of the derived key, the process memory is still a potential attack vector.
- **Mainnet Usage**: **Do not import mainnet private keys** containing significant value into the HardKAS keystore unless you fully understand the risks of "hot" software wallets.
- **Password Strength**: The security of the keystore depends entirely on the strength of the password you choose.

## Implementation Details

The implementation can be found in `@hardkas/accounts/src/keystore.ts`.
It uses `node:crypto` for AES-GCM and `hash-wasm` for Argon2id.
