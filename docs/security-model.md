# HardKAS Security & Safety Model

## Overview

HardKAS is a developer-centric operating environment for the Kaspa BlockDAG. Its security model is optimized for **developer velocity** and **local simulation**, rather than high-value production custody.

> [!WARNING]
> HardKAS is **NOT** production custody software. High-value mainnet assets should always be managed using hardware-backed core wallets.

## Local Development Safety

### 1. Network-Aware Constraints
To prevent accidental mainnet loss, certain destructive or state-modifying operations are strictly restricted by network type:

| Command | simnet/localnet/dev | testnet-1x | mainnet |
|:---|:---:|:---:|:---:|
| `hardkas faucet` | ✅ Allowed | ❌ Refused | ❌ Refused |
| `hardkas accounts fund` | ✅ Allowed | ❌ Refused | ❌ Refused |
| `hardkas node reset` | ✅ Allowed | ✅ Allowed | ✅ Allowed (Local Data) |
| `hardkas tx sign` | ✅ Allowed | ✅ Allowed | ⚠️ Requires --allow-mainnet-signing |

### 2. The Funding Guard
The `hardkas faucet` and `hardkas accounts fund` commands are hard-coded to only operate on local/simulated networks. They will explicitly refuse to execute if the configured network is `mainnet` or any public `testnet`.

### 3. Mainnet Signing Guard
By default, `hardkas tx sign` will refuse to sign transactions targeting `mainnet` unless the explicit flag `--allow-mainnet-signing` is provided. This acts as a manual circuit breaker for developers.

## Key Management
 
### 1. Default Encrypted Keystore
HardKAS enforces encrypted storage by default for all "real" persistent accounts:
- **Encryption**: Uses Argon2id for key derivation and AES-256-GCM for authenticated encryption.
- **File Permissions**: All keystore and account index files are stored with restrictive `0600` permissions.
- **Metadata Indexing**: Account metadata (names, addresses) is stored in `accounts.real.json` for listing, while secret material is isolated in individual files under `.hardkas/keystore/`.

### 2. Safer Key Import Patterns
To prevent secrets from leaking into shell history:
- **Environment Variables**: Use `--private-key-env` and `--password-env`.
- **Standard Input**: Use `--private-key-stdin` and `--password-stdin`.
- **Plaintext Opt-in**: Storing keys in plaintext requires the explicit `--unsafe-plaintext` flag.

### 3. Session Semantics (Stateless)
HardKAS is a stateless CLI, not a long-running daemon. Password access is required for each signing operation unless using environment variables.

## Artifact Integrity & Trust Boundary

HardKAS uses a formal **Artifact Model** to ensure that operational state is verifiable and reproducible.

### 1. The Trust Boundary
Artifact verification (`hardkas artifact verify`) provides a strong guarantee of **structural and internal consistency**, but does not prove **network finality** or **consensus validity** unless explicitly stated.

- **Content Hashing**: Uses deterministic canonicalization (BigInt-safe) to ensure hashes are stable across platforms.
- **Lineage Strictness**: Verification requires child artifacts to explicitly link to their parents, enforcing a verifiable provenance chain.
- **Honest Verification**: If a verification step (like consensus replay) is not implemented or skipped, the system will report it as a **warning**, never as a false "success".

### 2. Mode & Network Isolation
The system strictly prohibits "Contamination"—the mixing of data or modes:
- **Network Contamination**: Prevents signing a Testnet plan with a Mainnet key or vice versa.
- **Mode Contamination**: Prevents mixing simulated snapshots with real network transactions.

### 3. Auditability
Developers are encouraged to use `hardkas artifact explain` and `hardkas artifact verify --strict` to audit the economic and structural integrity of any transaction before it leaves the local environment.

---

## Safety Recommendations

1. **Use Separate Accounts**: Never use your primary mainnet seed phrase with HardKAS.
2. **Audit Before Signing**: Always use `hardkas tx profile` and `hardkas artifact verify` to audit transaction plans before signing them for mainnet.
3. **Keep Docker Updated**: Ensure your Docker engine is patched to the latest version.
4. **Report Vulnerabilities**: If you discover a security issue, please report it via the [HardKAS Security Policy](https://github.com/KasLabDevs/HardKas/security/policy).
